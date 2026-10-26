import mysql, { Pool } from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

let pool: Pool | null = null;
let initPromise: Promise<void> | null = null;

export function getDbPool(): Pool {
  if (!pool) {
    const host = process.env.DB_HOST || 'localhost';
    const port = Number(process.env.DB_PORT || 3306);
    const user = process.env.DB_USER || 'root';
    const password = process.env.DB_PASSWORD || 'Anshu123';
    const database = process.env.DB_NAME || 'gurukul_kurukshetra';

    pool = mysql.createPool({
      host,
      port,
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit: 15,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });
  }
  return pool;
}

export async function ensureDatabaseTables(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const db = getDbPool();

      // Create payment_orders table
      await db.query(`
        CREATE TABLE IF NOT EXISTS payment_orders (
          order_id VARCHAR(120) PRIMARY KEY,
          due_id VARCHAR(50) NOT NULL,
          due_title VARCHAR(255) NOT NULL,
          amount DECIMAL(10, 2) NOT NULL,
          currency VARCHAR(10) NOT NULL DEFAULT 'INR',
          status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
          candidate_name VARCHAR(255) NOT NULL,
          candidate_email VARCHAR(255) NOT NULL,
          candidate_phone VARCHAR(50) NOT NULL,
          registration_number VARCHAR(100) NOT NULL,
          checksum VARCHAR(255) NOT NULL,
          txn_id VARCHAR(120) NULL,
          payment_method VARCHAR(120) NULL,
          bank_ref VARCHAR(120) NULL,
          created_at VARCHAR(50) NOT NULL,
          updated_at VARCHAR(50) NOT NULL,
          cancelled_at VARCHAR(50) NULL,
          paid_at VARCHAR(50) NULL,
          cancel_reason TEXT NULL,
          INDEX idx_orders_reg (registration_number),
          INDEX idx_orders_status (status),
          INDEX idx_orders_due (due_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // Create user_ledgers table
      await db.query(`
        CREATE TABLE IF NOT EXISTS user_ledgers (
          id INT AUTO_INCREMENT PRIMARY KEY,
          registration_number VARCHAR(100) NOT NULL,
          due_id VARCHAR(50) NOT NULL,
          due_title VARCHAR(255) NOT NULL,
          order_id VARCHAR(120) NOT NULL,
          txn_id VARCHAR(120) NOT NULL,
          amount DECIMAL(10, 2) NOT NULL,
          paid_at VARCHAR(50) NOT NULL,
          UNIQUE KEY uk_reg_due (registration_number, due_id),
          INDEX idx_ledger_reg (registration_number)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // Optionally migrate legacy JSON data into MySQL if table is empty
      try {
        const [rows]: any = await db.query('SELECT COUNT(*) as cnt FROM payment_orders');
        const count = rows[0]?.cnt || 0;
        if (count === 0) {
          const jsonPath = path.join(process.cwd(), 'data', 'payment_orders.json');
          if (fs.existsSync(jsonPath)) {
            const raw = fs.readFileSync(jsonPath, 'utf8');
            const data = JSON.parse(raw);
            const orders = Object.values(data);
            for (const ord of orders as any[]) {
              await db.query(
                `INSERT IGNORE INTO payment_orders (
                  order_id, due_id, due_title, amount, currency, status,
                  candidate_name, candidate_email, candidate_phone, registration_number,
                  checksum, txn_id, payment_method, bank_ref, created_at,
                  updated_at, cancelled_at, paid_at, cancel_reason
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  ord.orderId,
                  ord.dueId,
                  ord.dueTitle,
                  ord.amount,
                  ord.currency || 'INR',
                  ord.status,
                  ord.candidateName,
                  ord.candidateEmail,
                  ord.candidatePhone,
                  ord.registrationNumber,
                  ord.checksum,
                  ord.txnId || null,
                  ord.paymentMethod || null,
                  ord.bankRef || null,
                  ord.createdAt,
                  ord.updatedAt,
                  ord.cancelledAt || null,
                  ord.paidAt || null,
                  ord.cancelReason || null,
                ]
              );
            }
            console.log(`[Database Migration] Successfully migrated ${orders.length} orders from payment_orders.json to MySQL.`);
          }

          const ledgerJsonPath = path.join(process.cwd(), 'data', 'user_ledgers.json');
          if (fs.existsSync(ledgerJsonPath)) {
            const raw = fs.readFileSync(ledgerJsonPath, 'utf8');
            const ledgers = JSON.parse(raw);
            for (const regNo of Object.keys(ledgers)) {
              const paidDues = ledgers[regNo]?.paidDues || {};
              for (const dueId of Object.keys(paidDues)) {
                const item = paidDues[dueId];
                await db.query(
                  `INSERT IGNORE INTO user_ledgers (
                    registration_number, due_id, due_title, order_id, txn_id, amount, paid_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                  [
                    regNo,
                    item.dueId,
                    item.dueTitle,
                    item.orderId,
                    item.txnId,
                    item.amount,
                    item.paidAt,
                  ]
                );
              }
            }
          }
        }
      } catch (migrationErr) {
        console.warn('[Database Migration Warning]:', migrationErr);
      }
    })();
  }
  return initPromise;
}
