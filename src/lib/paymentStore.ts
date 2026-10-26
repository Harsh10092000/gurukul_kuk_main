import crypto from 'crypto';
import { getTestFeeDue, FeeDueItem } from './testFeeDues';
import { getDbPool, ensureDatabaseTables } from './db';

export type PaymentOrderStatus = 'PENDING' | 'CHARGED' | 'CANCELLED' | 'FAILED';

export interface PaymentOrderRecord {
  orderId: string;
  dueId: string;
  dueTitle: string;
  amount: number;
  currency: string;
  status: PaymentOrderStatus;
  candidateName: string;
  candidateEmail: string;
  candidatePhone: string;
  registrationNumber: string;
  checksum: string; // SHA-256 integrity seal
  txnId?: string;
  paymentMethod?: string;
  bankRef?: string;
  createdAt: string;
  updatedAt: string;
  cancelledAt?: string;
  paidAt?: string;
  cancelReason?: string;
}

export interface UserDueLedger {
  registrationNumber: string;
  paidDues: Record<string, {
    dueId: string;
    dueTitle: string;
    orderId: string;
    txnId: string;
    amount: number;
    paidAt: string;
  }>;
}

const SECRET_SALT = 'GURUKUL_KURUKSHETRA_SECURITY_SALT_2026';

function mapRowToOrder(row: any): PaymentOrderRecord {
  return {
    orderId: row.order_id,
    dueId: row.due_id,
    dueTitle: row.due_title,
    amount: Number(row.amount),
    currency: row.currency || 'INR',
    status: row.status as PaymentOrderStatus,
    candidateName: row.candidate_name,
    candidateEmail: row.candidate_email,
    candidatePhone: row.candidate_phone,
    registrationNumber: row.registration_number,
    checksum: row.checksum,
    txnId: row.txn_id || undefined,
    paymentMethod: row.payment_method || undefined,
    bankRef: row.bank_ref || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cancelledAt: row.cancelled_at || undefined,
    paidAt: row.paid_at || undefined,
    cancelReason: row.cancel_reason || undefined,
  };
}

/**
 * Computes a secure cryptographic signature of order particulars
 * to detect any runtime payload tampering.
 */
export function calculateOrderChecksum(orderId: string, dueId: string, amount: number, regNo: string): string {
  const payload = `${orderId}:${dueId}:${amount.toFixed(2)}:${regNo}:${SECRET_SALT}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export const paymentStore = {
  /**
   * Generates a new order ID
   */
  generateOrderId(prefix = 'TEST_ORD'): string {
    const ts = Date.now();
    const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `${prefix}_${ts}_${rand}`;
  },

  /**
   * Generates a transaction reference
   */
  generateTxnId(): string {
    const ts = Date.now();
    const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `TXN_HDFC_${ts}_${rand}`;
  },

  /**
   * INITIATE ORDER with Anti-Tampering & Double-Payment Guards
   */
  async initiateOrder(params: {
    dueId: string;
    candidateName: string;
    candidateEmail: string;
    candidatePhone: string;
    registrationNumber: string;
    clientReportedAmount?: number; // Tested against server truth
    isRePay?: boolean;
  }): Promise<{ success: boolean; order?: PaymentOrderRecord; error?: string; code?: string }> {
    await ensureDatabaseTables();
    const db = getDbPool();

    const { dueId, candidateName, candidateEmail, candidatePhone, registrationNumber, clientReportedAmount, isRePay } = params;

    // 1. Resolve Fee Due strictly from server catalog
    const due = getTestFeeDue(dueId);
    if (!due) {
      return { success: false, error: `Invalid or unknown fee due ID: ${dueId}`, code: 'UNKNOWN_DUE' };
    }

    // 2. CHECK FOR AMOUNT TAMPERING
    if (clientReportedAmount !== undefined && Math.abs(clientReportedAmount - due.amount) > 0.001) {
      console.warn(`[SECURITY ALERT] Amount tampering detected! Client sent ₹${clientReportedAmount}, server catalog requires ₹${due.amount}`);
      return {
        success: false,
        error: `Security Violation: Request amount (₹${clientReportedAmount}) does not match official catalog fee (₹${due.amount}). Amount tampering blocked.`,
        code: 'AMOUNT_TAMPERING_DETECTED',
      };
    }

    // 3. CHECK FOR DOUBLE PAYMENT: Has this user already settled this due?
    if (!isRePay) {
      const [existingLedgers]: any = await db.query(
        'SELECT * FROM user_ledgers WHERE registration_number = ? AND due_id = ? LIMIT 1',
        [registrationNumber, dueId]
      );
      if (existingLedgers && existingLedgers.length > 0) {
        const existing = existingLedgers[0];
        return {
          success: false,
          error: `Double Payment Guard: Due "${due.title}" (${dueId}) has already been paid under Order ${existing.order_id} (Txn: ${existing.txn_id}) on ${existing.paid_at}.`,
          code: 'ALREADY_PAID',
        };
      }
    }

    // 4. Create new order with server-verified amount
    const orderId = this.generateOrderId();
    const checksum = calculateOrderChecksum(orderId, due.id, due.amount, registrationNumber);
    const now = new Date().toISOString();

    const newOrder: PaymentOrderRecord = {
      orderId,
      dueId: due.id,
      dueTitle: due.title,
      amount: due.amount,
      currency: 'INR',
      status: 'PENDING',
      candidateName,
      candidateEmail,
      candidatePhone,
      registrationNumber,
      checksum,
      createdAt: now,
      updatedAt: now,
    };

    await db.query(
      `INSERT INTO payment_orders (
        order_id, due_id, due_title, amount, currency, status,
        candidate_name, candidate_email, candidate_phone, registration_number,
        checksum, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newOrder.orderId,
        newOrder.dueId,
        newOrder.dueTitle,
        newOrder.amount,
        newOrder.currency,
        newOrder.status,
        newOrder.candidateName,
        newOrder.candidateEmail,
        newOrder.candidatePhone,
        newOrder.registrationNumber,
        newOrder.checksum,
        newOrder.createdAt,
        newOrder.updatedAt,
      ]
    );

    return { success: true, order: newOrder };
  },

  /**
   * APPROVE PAYMENT with Anti-Tampering & Idempotency Checks
   */
  async approvePayment(
    orderId: string,
    paymentMethod = 'HDFC SmartGateway',
    customTxnId?: string,
    bankRef?: string
  ): Promise<{
    success: boolean;
    order?: PaymentOrderRecord;
    error?: string;
    code?: string;
    isDuplicate?: boolean;
  }> {
    await ensureDatabaseTables();
    const db = getDbPool();

    const [rows]: any = await db.query(
      'SELECT * FROM payment_orders WHERE order_id = ? LIMIT 1',
      [orderId]
    );

    if (!rows || rows.length === 0) {
      return { success: false, error: `Order ${orderId} not found.`, code: 'ORDER_NOT_FOUND' };
    }

    const order = mapRowToOrder(rows[0]);

    // 1. IDEMPOTENT / DOUBLE PAYMENT CHECK: Already charged?
    if (order.status === 'CHARGED') {
      return {
        success: true,
        order,
        isDuplicate: true,
      };
    }

    // 2. Cancellation check
    if (order.status === 'CANCELLED') {
      return {
        success: false,
        error: `Order ${orderId} was previously cancelled. Please initiate a fresh checkout session.`,
        code: 'ORDER_CANCELLED',
      };
    }

    // 3. Tamper check: Verify cryptographic checksum
    const expectedChecksum = calculateOrderChecksum(order.orderId, order.dueId, order.amount, order.registrationNumber);
    if (order.checksum !== expectedChecksum) {
      return {
        success: false,
        error: `Cryptographic integrity verification failed for order ${orderId}. Record appears altered.`,
        code: 'INTEGRITY_COMPROMISED',
      };
    }

    // 4. Confirm the amount matches server catalog
    const catalogDue = getTestFeeDue(order.dueId);
    if (!catalogDue || Math.abs(catalogDue.amount - order.amount) > 0.001) {
      return {
        success: false,
        error: `Amount mismatch against server fee catalog for due ${order.dueId}.`,
        code: 'CATALOG_MISMATCH',
      };
    }

    // 5. Update Order to CHARGED in Database
    const txnId = customTxnId || this.generateTxnId();
    const now = new Date().toISOString();
    const resolvedBankRef = bankRef || `HDFC_REF_${Date.now()}`;

    await db.query(
      `UPDATE payment_orders
       SET status = 'CHARGED', txn_id = ?, payment_method = ?, bank_ref = ?, paid_at = ?, updated_at = ?
       WHERE order_id = ?`,
      [txnId, paymentMethod, resolvedBankRef, now, now, orderId]
    );

    // 6. Record in User Ledger Table
    await db.query(
      `INSERT INTO user_ledgers (
        registration_number, due_id, due_title, order_id, txn_id, amount, paid_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        order_id = VALUES(order_id),
        txn_id = VALUES(txn_id),
        amount = VALUES(amount),
        paid_at = VALUES(paid_at)`,
      [
        order.registrationNumber,
        order.dueId,
        order.dueTitle,
        order.orderId,
        txnId,
        order.amount,
        now,
      ]
    );

    order.status = 'CHARGED';
    order.txnId = txnId;
    order.paymentMethod = paymentMethod;
    order.bankRef = resolvedBankRef;
    order.paidAt = now;
    order.updatedAt = now;

    return { success: true, order };
  },

  /**
   * CANCEL PAYMENT with Clean State Transition
   */
  async cancelPayment(orderId: string, reason = 'User aborted gateway payment'): Promise<{
    success: boolean;
    order?: PaymentOrderRecord;
    error?: string;
  }> {
    await ensureDatabaseTables();
    const db = getDbPool();

    const [rows]: any = await db.query(
      'SELECT * FROM payment_orders WHERE order_id = ? LIMIT 1',
      [orderId]
    );

    if (!rows || rows.length === 0) {
      return { success: false, error: `Order ${orderId} not found.` };
    }

    const order = mapRowToOrder(rows[0]);

    if (order.status === 'CHARGED') {
      return {
        success: false,
        error: `Cannot cancel an already completed and charged payment order.`,
      };
    }

    const now = new Date().toISOString();

    await db.query(
      `UPDATE payment_orders
       SET status = 'CANCELLED', cancelled_at = ?, cancel_reason = ?, updated_at = ?
       WHERE order_id = ?`,
      [now, reason, now, orderId]
    );

    order.status = 'CANCELLED';
    order.cancelledAt = now;
    order.cancelReason = reason;
    order.updatedAt = now;

    return { success: true, order };
  },

  /**
   * MARK PAYMENT FAILED
   */
  async markPaymentFailed(orderId: string, reason = 'Bank payment declined'): Promise<{
    success: boolean;
    order?: PaymentOrderRecord;
    error?: string;
  }> {
    await ensureDatabaseTables();
    const db = getDbPool();

    const [rows]: any = await db.query(
      'SELECT * FROM payment_orders WHERE order_id = ? LIMIT 1',
      [orderId]
    );

    if (!rows || rows.length === 0) {
      return { success: false, error: `Order ${orderId} not found.` };
    }

    const order = mapRowToOrder(rows[0]);

    if (order.status === 'CHARGED') {
      return {
        success: false,
        error: `Cannot mark a charged order as failed.`,
      };
    }

    const now = new Date().toISOString();

    await db.query(
      `UPDATE payment_orders
       SET status = 'FAILED', cancel_reason = ?, updated_at = ?
       WHERE order_id = ?`,
      [reason, now, orderId]
    );

    order.status = 'FAILED';
    order.cancelReason = reason;
    order.updatedAt = now;

    return { success: true, order };
  },

  /**
   * Get Order by ID
   */
  async getOrder(orderId: string): Promise<PaymentOrderRecord | null> {
    await ensureDatabaseTables();
    const db = getDbPool();

    const [rows]: any = await db.query(
      'SELECT * FROM payment_orders WHERE order_id = ? LIMIT 1',
      [orderId]
    );

    if (!rows || rows.length === 0) {
      return null;
    }

    return mapRowToOrder(rows[0]);
  },

  /**
   * Get user paid dues ledger
   */
  async getUserLedger(registrationNumber: string): Promise<UserDueLedger> {
    await ensureDatabaseTables();
    const db = getDbPool();

    const [rows]: any = await db.query(
      'SELECT * FROM user_ledgers WHERE registration_number = ?',
      [registrationNumber]
    );

    const paidDues: UserDueLedger['paidDues'] = {};
    if (rows && rows.length > 0) {
      for (const row of rows) {
        paidDues[row.due_id] = {
          dueId: row.due_id,
          dueTitle: row.due_title,
          orderId: row.order_id,
          txnId: row.txn_id,
          amount: Number(row.amount),
          paidAt: row.paid_at,
        };
      }
    }

    return {
      registrationNumber,
      paidDues,
    };
  },

  /**
   * Reset user dues (Test Helper)
   */
  async resetUserDues(registrationNumber?: string): Promise<void> {
    await ensureDatabaseTables();
    const db = getDbPool();
    const now = new Date().toISOString();

    if (!registrationNumber || registrationNumber === 'all') {
      await db.query('DELETE FROM user_ledgers');
      await db.query(
        `UPDATE payment_orders
         SET status = 'CANCELLED', cancel_reason = 'Test dues reset by operator', updated_at = ?
         WHERE status = 'CHARGED'`,
        [now]
      );
    } else {
      await db.query('DELETE FROM user_ledgers WHERE registration_number = ?', [registrationNumber]);
      await db.query(
        `UPDATE payment_orders
         SET status = 'CANCELLED', cancel_reason = 'Test dues reset by operator', updated_at = ?
         WHERE registration_number = ? AND status = 'CHARGED'`,
        [now, registrationNumber]
      );
    }
  },
};
