import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getTestFeeDue, FeeDueItem } from './testFeeDues';

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

const DATA_DIR = path.join(process.cwd(), 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'payment_orders.json');
const LEDGER_FILE = path.join(DATA_DIR, 'user_ledgers.json');
const SECRET_SALT = 'GURUKUL_KURUKSHETRA_SECURITY_SALT_2026';

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadOrders(): Record<string, PaymentOrderRecord> {
  ensureDataDir();
  if (!fs.existsSync(ORDERS_FILE)) return {};
  try {
    const raw = fs.readFileSync(ORDERS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveOrders(orders: Record<string, PaymentOrderRecord>) {
  ensureDataDir();
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf8');
}

function loadLedgers(): Record<string, UserDueLedger> {
  ensureDataDir();
  if (!fs.existsSync(LEDGER_FILE)) return {};
  try {
    const raw = fs.readFileSync(LEDGER_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveLedgers(ledgers: Record<string, UserDueLedger>) {
  ensureDataDir();
  fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledgers, null, 2), 'utf8');
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
  initiateOrder(params: {
    dueId: string;
    candidateName: string;
    candidateEmail: string;
    candidatePhone: string;
    registrationNumber: string;
    clientReportedAmount?: number; // Tested against server truth
    isRePay?: boolean;
  }): { success: boolean; order?: PaymentOrderRecord; error?: string; code?: string } {
    const { dueId, candidateName, candidateEmail, candidatePhone, registrationNumber, clientReportedAmount, isRePay } = params;

    // 1. Resolve Fee Due strictly from server catalog
    const due = getTestFeeDue(dueId);
    if (!due) {
      return { success: false, error: `Invalid or unknown fee due ID: ${dueId}`, code: 'UNKNOWN_DUE' };
    }

    // 2. CHECK FOR AMOUNT TAMPERING
    // If the client provided an amount that deviates from the server-side price, flag tampering!
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
      const ledgers = loadLedgers();
      const userLedger = ledgers[registrationNumber];
      if (userLedger?.paidDues && userLedger.paidDues[dueId]) {
        const existing = userLedger.paidDues[dueId];
        return {
          success: false,
          error: `Double Payment Guard: Due "${due.title}" (${dueId}) has already been paid under Order ${existing.orderId} (Txn: ${existing.txnId}) on ${existing.paidAt}.`,
          code: 'ALREADY_PAID',
        };
      }
    }

    // 4. Create new order with server-verified amount
    const orderId = this.generateOrderId();
    const checksum = calculateOrderChecksum(orderId, due.id, due.amount, registrationNumber);

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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const orders = loadOrders();
    orders[orderId] = newOrder;
    saveOrders(orders);

    return { success: true, order: newOrder };
  },

  /**
   * APPROVE PAYMENT with Anti-Tampering & Idempotency Checks
   */
  approvePayment(
    orderId: string,
    paymentMethod = 'HDFC SmartGateway',
    customTxnId?: string,
    bankRef?: string
  ): {
    success: boolean;
    order?: PaymentOrderRecord;
    error?: string;
    code?: string;
    isDuplicate?: boolean;
  } {
    const orders = loadOrders();
    const order = orders[orderId];

    if (!order) {
      return { success: false, error: `Order ${orderId} not found.`, code: 'ORDER_NOT_FOUND' };
    }

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

    // 5. Update Order to CHARGED
    const txnId = customTxnId || this.generateTxnId();
    const now = new Date().toISOString();
    order.status = 'CHARGED';
    order.txnId = txnId;
    order.paymentMethod = paymentMethod;
    order.bankRef = bankRef || `HDFC_REF_${Date.now()}`;
    order.paidAt = now;
    order.updatedAt = now;

    orders[orderId] = order;
    saveOrders(orders);

    // 6. Record in User Ledger
    const ledgers = loadLedgers();
    if (!ledgers[order.registrationNumber]) {
      ledgers[order.registrationNumber] = {
        registrationNumber: order.registrationNumber,
        paidDues: {},
      };
    }
    ledgers[order.registrationNumber].paidDues[order.dueId] = {
      dueId: order.dueId,
      dueTitle: order.dueTitle,
      orderId: order.orderId,
      txnId,
      amount: order.amount,
      paidAt: now,
    };
    saveLedgers(ledgers);

    return { success: true, order };
  },

  /**
   * CANCEL PAYMENT with Clean State Transition
   */
  cancelPayment(orderId: string, reason = 'User aborted gateway payment'): {
    success: boolean;
    order?: PaymentOrderRecord;
    error?: string;
  } {
    const orders = loadOrders();
    const order = orders[orderId];

    if (!order) {
      return { success: false, error: `Order ${orderId} not found.` };
    }

    if (order.status === 'CHARGED') {
      return {
        success: false,
        error: `Cannot cancel an already completed and charged payment order.`,
      };
    }

    const now = new Date().toISOString();
    order.status = 'CANCELLED';
    order.cancelledAt = now;
    order.cancelReason = reason;
    order.updatedAt = now;

    orders[orderId] = order;
    saveOrders(orders);

    return { success: true, order };
  },

  /**
   * MARK PAYMENT FAILED
   */
  markPaymentFailed(orderId: string, reason = 'Bank payment declined'): {
    success: boolean;
    order?: PaymentOrderRecord;
    error?: string;
  } {
    const orders = loadOrders();
    const order = orders[orderId];

    if (!order) {
      return { success: false, error: `Order ${orderId} not found.` };
    }

    if (order.status === 'CHARGED') {
      return {
        success: false,
        error: `Cannot mark a charged order as failed.`,
      };
    }

    const now = new Date().toISOString();
    order.status = 'FAILED';
    order.cancelReason = reason;
    order.updatedAt = now;

    orders[orderId] = order;
    saveOrders(orders);

    return { success: true, order };
  },

  /**
   * Get Order by ID
   */
  getOrder(orderId: string): PaymentOrderRecord | null {
    const orders = loadOrders();
    return orders[orderId] || null;
  },

  /**
   * Get user paid dues ledger
   */
  getUserLedger(registrationNumber: string): UserDueLedger {
    const ledgers = loadLedgers();
    return ledgers[registrationNumber] || {
      registrationNumber,
      paidDues: {},
    };
  },

  /**
   * Reset all user dues (Test Helper)
   */
  resetUserDues(registrationNumber?: string) {
    const ledgers = loadLedgers();
    if (!registrationNumber || registrationNumber === 'all') {
      Object.keys(ledgers).forEach((key) => delete ledgers[key]);
    } else {
      delete ledgers[registrationNumber];
    }
    saveLedgers(ledgers);

    // Also cancel charged orders for reset candidates so idempotency doesn't block future tests
    const orders = loadOrders();
    let hasOrderChanges = false;
    Object.values(orders).forEach((ord) => {
      if (!registrationNumber || registrationNumber === 'all' || ord.registrationNumber === registrationNumber) {
        if (ord.status === 'CHARGED') {
          ord.status = 'CANCELLED';
          ord.cancelReason = 'Test dues reset by operator';
          ord.updatedAt = new Date().toISOString();
          hasOrderChanges = true;
        }
      }
    });
    if (hasOrderChanges) {
      saveOrders(orders);
    }
  },
};
