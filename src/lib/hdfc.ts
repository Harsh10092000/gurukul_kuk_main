import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Juspay, APIError } from 'expresscheckout-nodejs';

// Silence verbose internal logger to avoid dumping sensitive JWE/crypto payloads into server logs
try {
  (Juspay as any).customLogger = (Juspay as any).silentLogger;
} catch {
  // Ignore if silentLogger is unavailable
}

export const HDFC_CONFIG = {
  MERCHANT_ID: process.env.HDFC_MERCHANT_ID || 'SG6464',
  PAYMENT_PAGE_CLIENT_ID: process.env.HDFC_PAYMENT_PAGE_CLIENT_ID || 'hdfcmaster',
  BASE_URL: process.env.HDFC_BASE_URL || 'https://smartgateway.hdfcuat.bank.in',
  KEY_UUID: process.env.HDFC_KEY_UUID || 'key_bb3324ad3a294829b45704873d2b7e56',
  PRIVATE_KEY_PATH: process.env.HDFC_PRIVATE_KEY_PATH || 'certs/privateKey.pem',
  PUBLIC_KEY_PATH: process.env.HDFC_PUBLIC_KEY_PATH || 'certs/key_bb3324ad3a294829b45704873d2b7e56.pem',
  RESPONSE_KEY: process.env.HDFC_RESPONSE_KEY || '',
  RETURN_URL: process.env.HDFC_RETURN_URL || '',
  CURRENCY: 'INR',
  PAYMENT_MODE: process.env.HDFC_PAYMENT_MODE || 'demo',
};

let cachedJuspayInstance: any = null;

/**
 * Resolve RSA Private Key from either environment variable or file
 */
function getPrivateKey(): string {
  if (process.env.HDFC_PRIVATE_KEY_B64) {
    try {
      const decoded = Buffer.from(process.env.HDFC_PRIVATE_KEY_B64, 'base64').toString('utf8');
      if (decoded.includes('PRIVATE KEY')) return decoded;
    } catch { }
  }

  if (process.env.HDFC_PRIVATE_KEY && process.env.HDFC_PRIVATE_KEY.includes('PRIVATE KEY')) {
    return process.env.HDFC_PRIVATE_KEY.replace(/\\n/g, '\n');
  }

  const primaryPath = path.isAbsolute(HDFC_CONFIG.PRIVATE_KEY_PATH)
    ? HDFC_CONFIG.PRIVATE_KEY_PATH
    : path.resolve(process.cwd(), HDFC_CONFIG.PRIVATE_KEY_PATH);

  if (fs.existsSync(primaryPath)) {
    return fs.readFileSync(primaryPath, 'utf8');
  }

  const fallbackPath = path.resolve(process.cwd(), 'certs', 'privateKey.pem');
  if (fs.existsSync(fallbackPath)) {
    return fs.readFileSync(fallbackPath, 'utf8');
  }

  throw new Error(`HDFC SmartGateway: Private key file not found. Provide certs/privateKey.pem or set HDFC_PRIVATE_KEY.`);
}

/**
 * Resolve RSA Public Key from either environment variable or file
 */
function getPublicKey(): string {
  if (process.env.HDFC_PUBLIC_KEY_B64) {
    try {
      const decoded = Buffer.from(process.env.HDFC_PUBLIC_KEY_B64, 'base64').toString('utf8');
      if (decoded.includes('PUBLIC KEY')) return decoded;
    } catch { }
  }

  if (process.env.HDFC_PUBLIC_KEY && process.env.HDFC_PUBLIC_KEY.includes('PUBLIC KEY')) {
    return process.env.HDFC_PUBLIC_KEY.replace(/\\n/g, '\n');
  }

  const primaryPath = path.isAbsolute(HDFC_CONFIG.PUBLIC_KEY_PATH)
    ? HDFC_CONFIG.PUBLIC_KEY_PATH
    : path.resolve(process.cwd(), HDFC_CONFIG.PUBLIC_KEY_PATH);

  if (fs.existsSync(primaryPath)) {
    return fs.readFileSync(primaryPath, 'utf8');
  }

  const fallbackPath = path.resolve(process.cwd(), 'certs', 'key_bb3324ad3a294829b45704873d2b7e56.pem');
  if (fs.existsSync(fallbackPath)) {
    return fs.readFileSync(fallbackPath, 'utf8');
  }

  throw new Error(`HDFC SmartGateway: Public key file not found. Provide certs/key_bb3324ad3a294829b45704873d2b7e56.pem or set HDFC_PUBLIC_KEY.`);
}

/**
 * Get or initialize Juspay SDK client instance
 */
export function getJuspayClient() {
  if (cachedJuspayInstance) {
    return cachedJuspayInstance;
  }

  const publicKey = getPublicKey();
  const privateKey = getPrivateKey();

  cachedJuspayInstance = new Juspay({
    merchantId: HDFC_CONFIG.MERCHANT_ID,
    baseUrl: HDFC_CONFIG.BASE_URL,
    jweAuth: {
      keyId: HDFC_CONFIG.KEY_UUID,
      publicKey,
      privateKey,
    },
  });

  return cachedJuspayInstance;
}

/**
 * Generate unique, valid order ID
 * Must be <= 40 chars, alphanumeric with hyphens/underscores
 */
export function generateHdfcOrderId(prefix = 'KUR'): string {
  const timestamp = Date.now();
  const randomSuffix = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}_${timestamp}_${randomSuffix}`;
}

export const OFFICIAL_PRODUCTION_URL = 'https://admission.gurukulkurukshetra.com';

/**
 * Safely resolve public base URL of the portal.
 * Seamlessly handles:
 * - Production: https://admission.gurukulkurukshetra.com
 * - Local development: http://localhost:3000 (or http://127.0.0.1:3000)
 * - Reverse proxies (Nginx, Cloudflare, Vercel) via x-forwarded-host & x-forwarded-proto
 */
export function getPublicBaseUrl(req?: Request): string {
  // 1. Check incoming request headers first (dynamically adapts to active domain)
  if (req) {
    try {
      const parsedUrl = new URL(req.url);
      const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0].trim();
      const host = forwardedHost || req.headers.get('host') || (parsedUrl.host !== 'null' ? parsedUrl.host : '');

      if (host && host !== 'null') {
        const isLocalHost = host.includes('localhost') || host.includes('127.0.0.1');
        if (isLocalHost) {
          const proto = req.headers.get('x-forwarded-proto') || (parsedUrl.protocol ? parsedUrl.protocol.replace(':', '') : 'http');
          return `${proto}://${host}`.replace(/\/$/, '');
        }

        // Live production or custom domain
        const proto = req.headers.get('x-forwarded-proto') || (parsedUrl.protocol ? parsedUrl.protocol.replace(':', '') : 'https');
        return `${proto}://${host}`.replace(/\/$/, '');
      }

      // Check referer / origin if host header was empty
      const origin = req.headers.get('origin');
      if (origin && origin !== 'null' && !origin.includes('null')) {
        return origin.replace(/\/$/, '');
      }

      const referer = req.headers.get('referer');
      if (referer) {
        try {
          const refUrl = new URL(referer);
          if (refUrl.origin && refUrl.origin !== 'null' && !refUrl.origin.includes('null')) {
            return refUrl.origin.replace(/\/$/, '');
          }
        } catch {}
      }

      if (parsedUrl.origin && parsedUrl.origin !== 'null' && !parsedUrl.origin.includes('null')) {
        return parsedUrl.origin.replace(/\/$/, '');
      }
    } catch {}
  }

  // 2. Explicit environment variable override
  const envAppUrl = (process.env.NEXT_PUBLIC_APP_URL || '').trim();
  if (envAppUrl && !envAppUrl.startsWith('null')) {
    const isLocal = envAppUrl.includes('localhost') || envAppUrl.includes('127.0.0.1');
    const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
    if (!isProd || !isLocal) {
      return envAppUrl.replace(/\/$/, '');
    }
  }

  // 3. Vercel deployment URL if present
  const vercelHost = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_VERCEL_URL;
  if (vercelHost) {
    return `https://${vercelHost.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
  }

  // 4. Default official production domain for Gurukul Kurukshetra
  if (process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL)) {
    return OFFICIAL_PRODUCTION_URL;
  }

  // 5. Localhost fallback exclusively for local development
  return 'http://localhost:3000';
}

/**
 * Build dynamic return URL from incoming request or environment
 */
export function resolveReturnUrl(req?: Request): string {
  if (HDFC_CONFIG.RETURN_URL && HDFC_CONFIG.RETURN_URL.trim() !== '') {
    const configured = HDFC_CONFIG.RETURN_URL.trim();
    const isConfigLocal = configured.includes('localhost') || configured.includes('127.0.0.1');
    const isProd = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL);
    if (!isProd || !isConfigLocal) {
      return configured;
    }
  }

  const base = getPublicBaseUrl(req);
  return `${base}/api/payment/test/return`;
}

export interface CreateHdfcOrderSessionOptions {
  orderId: string;
  customerId: string;
  customerEmail: string;
  customerPhone: string;
  returnUrl: string;
  amount: number;
  description?: string;
  metadata?: Record<string, string>;
}

export interface HdfcOrderSessionResult {
  orderId: string;
  paymentUrl: string;
  expiry?: string;
  status: string;
  rawResponse: any;
}

/**
 * Create an HDFC Hosted Order Session
 */
export async function createHdfcOrderSession(
  options: CreateHdfcOrderSessionOptions
): Promise<HdfcOrderSessionResult> {
  const juspay = getJuspayClient();

  const payload: any = {
    order_id: options.orderId,
    amount: options.amount,
    currency: HDFC_CONFIG.CURRENCY,
    payment_page_client_id: HDFC_CONFIG.PAYMENT_PAGE_CLIENT_ID,
    customer_id: options.customerId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 50),
    action: 'paymentPage',
    return_url: options.returnUrl,
    description: options.description || 'Gurukul Kurukshetra Student Fee Payment',
  };

  if (options.customerEmail) {
    payload.customer_email = options.customerEmail.trim();
  }
  if (options.customerPhone) {
    const cleanPhone = options.customerPhone.replace(/\D/g, '').slice(-10);
    if (cleanPhone.length === 10) {
      payload.customer_phone = cleanPhone;
    }
  }

  if (options.metadata) {
    let udfIdx = 1;
    for (const [k, v] of Object.entries(options.metadata)) {
      if (udfIdx <= 10 && v) {
        payload[`udf${udfIdx}`] = `${k}:${v}`.slice(0, 100);
        udfIdx++;
      }
    }
  }

  try {
    const sessionResponse = await juspay.orderSession.create(payload);

    const paymentUrl = sessionResponse?.payment_links?.web;
    if (!paymentUrl) {
      throw new Error(
        `HDFC SmartGateway: No hosted payment URL returned. Status: ${sessionResponse?.status}`
      );
    }

    return {
      orderId: sessionResponse.order_id || options.orderId,
      paymentUrl,
      expiry: sessionResponse.payment_links?.expiry,
      status: sessionResponse.status || 'NEW',
      rawResponse: sessionResponse,
    };
  } catch (error: any) {
    if (error instanceof APIError) {
      throw new Error(`HDFC SmartGateway API Error (${error.status || 'unknown'}): ${error.message}`);
    }
    throw error;
  }
}

/**
 * Fetch server-to-server Order Status directly from HDFC
 */
export async function fetchHdfcOrderStatus(orderId: string): Promise<any> {
  if (!orderId || typeof orderId !== 'string') {
    throw new Error('Valid orderId is required for HDFC order status call');
  }

  const juspay = getJuspayClient();

  try {
    const statusResponse = await juspay.order.status(orderId);
    return statusResponse;
  } catch (error: any) {
    if (error instanceof APIError) {
      throw new Error(`HDFC SmartGateway Status API Error (${error.status}): ${error.message}`);
    }
    throw error;
  }
}

/**
 * Verify HMAC SHA256 signature if response key is configured
 */
export function verifyHdfcResponseSignature(signature: string, payloadString: string): boolean {
  if (!HDFC_CONFIG.RESPONSE_KEY) {
    return true; // No secret configured, rely strictly on server-to-server status call
  }
  if (!signature || !payloadString) {
    return false;
  }

  try {
    const expected = crypto
      .createHmac('sha256', HDFC_CONFIG.RESPONSE_KEY)
      .update(payloadString)
      .digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
