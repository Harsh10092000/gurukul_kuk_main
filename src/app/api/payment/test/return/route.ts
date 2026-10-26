import { NextResponse } from 'next/server';
import { paymentStore } from '@/lib/paymentStore';
import { fetchHdfcOrderStatus, getPublicBaseUrl } from '@/lib/hdfc';

export const dynamic = 'force-dynamic';

function safeRedirect(targetPath: string, req: Request) {
  let baseUrl = getPublicBaseUrl(req);
  if (!baseUrl || baseUrl === 'null' || !baseUrl.startsWith('http')) {
    try {
      const parsedUrl = new URL(req.url);
      if (parsedUrl.origin && parsedUrl.origin !== 'null' && !parsedUrl.origin.includes('null')) {
        baseUrl = parsedUrl.origin;
      }
    } catch {}
  }

  if (!baseUrl || baseUrl === 'null' || !baseUrl.startsWith('http')) {
    baseUrl = process.env.NODE_ENV === 'production' || Boolean(process.env.VERCEL)
      ? 'https://admission.gurukulkurukshetra.com'
      : 'http://localhost:3000';
  }

  const cleanBase = baseUrl.replace(/\/$/, '');
  const cleanPath = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
  return NextResponse.redirect(`${cleanBase}${cleanPath}`, 303);
}

async function extractOrderParams(request: Request): Promise<{ orderId: string | null; body: any }> {
  const url = new URL(request.url);
  let orderId = url.searchParams.get('order_id') || url.searchParams.get('orderId');
  let body: any = {};

  if (request.method === 'POST') {
    const contentType = request.headers.get('content-type') || '';
    try {
      if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
        const formData = await request.formData();
        const formOrderId = formData.get('order_id') || formData.get('orderId');
        if (formOrderId && typeof formOrderId === 'string') {
          orderId = formOrderId;
        }
        formData.forEach((val, key) => {
          body[key] = val;
        });
      } else if (contentType.includes('application/json')) {
        const json = await request.json();
        body = json;
        if (json.order_id || json.orderId) {
          orderId = json.order_id || json.orderId;
        }
      }
    } catch (e) {
      console.warn('Could not parse POST body in HDFC test return handler:', e);
    }
  }

  return { orderId, body };
}

async function handleHdfcReturn(request: Request) {
  const { orderId, body } = await extractOrderParams(request);

  if (!orderId) {
    return safeRedirect('/payment?step=pay&status=error&msg=Missing+Order+Identifier', request);
  }

  const paymentOrder = paymentStore.getOrder(orderId);
  const urlObj = new URL(request.url);
  const dueId = urlObj.searchParams.get('dueId') || paymentOrder?.dueId || '';
  const dueTitle = urlObj.searchParams.get('dueTitle') || paymentOrder?.dueTitle || '';

  if (!paymentOrder) {
    return safeRedirect('/payment?step=pay&status=error&msg=Order+record+not+found', request);
  }

  // 1. EXTRACT INCOMING STATUS & FAILURE / CANCELLATION SIGNALS FIRST
  // (Prevents sandbox/dummy PG auto-authorization from overriding explicit OTP cancellation)
  const rawStatus = (
    body?.status ||
    urlObj.searchParams.get('status') ||
    urlObj.searchParams.get('payment') ||
    ''
  ).toUpperCase();

  const rawStatusId = Number(body?.status_id || urlObj.searchParams.get('status_id') || 0);
  const errorCode = (body?.error_code || urlObj.searchParams.get('error_code') || '').toUpperCase();
  const errorMsg = (body?.error_message || body?.resp_message || urlObj.searchParams.get('msg') || '').toLowerCase();

  const isExplicitAbortOrCancel =
    rawStatus === 'USER_ABORTED' ||
    rawStatus === 'CANCELLED' ||
    rawStatus === 'AUTHENTICATION_FAILED' ||
    rawStatus === 'USER_DROPPED' ||
    rawStatus === 'CUSTOMER_DROPPED' ||
    rawStatus === 'DROPPED' ||
    rawStatusId === 26 || // AUTHENTICATION_FAILED (Juspay standard code for OTP cancel/failure)
    rawStatusId === 27 || // USER_ABORTED (User clicked Cancel on gateway)
    errorCode === 'JP_002' ||
    errorCode === 'AUTHENTICATION_FAILED' ||
    errorMsg.includes('abort') ||
    errorMsg.includes('cancel');

  if (isExplicitAbortOrCancel) {
    console.log(`[HDFC SmartGateway Return] Order ${orderId} was cancelled/aborted by user (status: ${rawStatus}, status_id: ${rawStatusId})`);
    paymentStore.cancelPayment(orderId, 'User cancelled payment at bank OTP / authorization screen');
    return safeRedirect(
      `/payment?step=pay&orderId=${encodeURIComponent(orderId)}&status=cancelled&msg=Payment+was+cancelled+at+the+bank+OTP+screen.+Your+due+remains+pending;+click+Pay+to+retry.`,
      request
    );
  }

  // IDEMPOTENCY GUARD: If already CHARGED in our local store, don't re-process, just show receipt
  if (paymentOrder.status === 'CHARGED') {
    const prevTxnId = paymentOrder.txnId || `TXN_${orderId.slice(-8)}`;
    return safeRedirect(
      `/payment?step=thankyou&orderId=${encodeURIComponent(orderId)}&txnId=${encodeURIComponent(prevTxnId)}&amount=${encodeURIComponent(String(paymentOrder.amount))}&dueId=${encodeURIComponent(dueId)}&dueTitle=${encodeURIComponent(dueTitle)}&status=success`,
      request
    );
  }

  // 2. SECURITY GUARD: Server-to-server Order Status API call with HDFC Bank
  let statusResponse: any = null;
  try {
    statusResponse = await fetchHdfcOrderStatus(orderId);
  } catch (err: any) {
    console.warn('[HDFC SmartGateway] Status check error:', err?.message);
    if (isExplicitAbortOrCancel) {
      paymentStore.cancelPayment(orderId, 'User aborted payment session at bank');
      return safeRedirect(`/payment?step=pay&orderId=${encodeURIComponent(orderId)}&status=cancelled`, request);
    }

    return safeRedirect(`/payment?step=pay&orderId=${encodeURIComponent(orderId)}&status=pending&msg=Verifying+Payment+Status`, request);
  }

  // ANTI-TAMPERING: Order ID must strictly match
  if (statusResponse?.order_id && statusResponse.order_id !== orderId) {
    console.error(`[SECURITY TAMPER GUARD] Order ID mismatch! Expected ${orderId}, got ${statusResponse?.order_id}`);
    return safeRedirect('/payment?step=pay&status=error&msg=Order+verification+mismatch', request);
  }

  // ANTI-TAMPERING: Amount returned from Bank must strictly match stored order amount
  const expectedAmount = paymentOrder.amount;
  const returnedAmount = statusResponse?.amount !== undefined ? parseFloat(String(statusResponse.amount)) : expectedAmount;
  if (Math.abs(returnedAmount - expectedAmount) > 0.01) {
    console.error(`[SECURITY TAMPER GUARD] Amount mismatch for order ${orderId}: Expected ₹${expectedAmount}, bank returned ₹${returnedAmount}`);
    return safeRedirect('/payment?step=pay&status=error&msg=Amount+verification+failed', request);
  }

  // 3. EVALUATE BANK API RESPONSE
  const apiStatus = (statusResponse?.status || '').toUpperCase();
  const apiStatusId = Number(statusResponse?.status_id || 0);
  const txnStatus = (statusResponse?.txn_detail?.status || '').toUpperCase();
  const txnId = statusResponse?.txn_id || statusResponse?.transaction_id || `TXN_${orderId.slice(-8)}`;
  const bankRef = statusResponse?.bank_ref_no || statusResponse?.payment_gateway_response?.rrn || `HDFC_${Date.now()}`;

  // Check if bank API itself reports cancellation or OTP authentication failure
  const isApiCancelled =
    apiStatus === 'USER_ABORTED' ||
    apiStatus === 'CANCELLED' ||
    apiStatus === 'AUTHENTICATION_FAILED' ||
    apiStatus === 'USER_DROPPED' ||
    apiStatus === 'DROPPED' ||
    apiStatusId === 26 || // AUTHENTICATION_FAILED
    apiStatusId === 27 || // USER_ABORTED
    txnStatus === 'USER_ABORTED' ||
    txnStatus === 'CANCELLED' ||
    txnStatus === 'AUTHENTICATION_FAILED';

  if (isApiCancelled) {
    paymentStore.cancelPayment(orderId, statusResponse?.resp_message || 'Payment cancelled or authentication aborted at bank OTP screen');
    return safeRedirect(
      `/payment?step=pay&orderId=${encodeURIComponent(orderId)}&status=cancelled&msg=Payment+authentication+was+cancelled+or+failed.+Your+due+remains+pending;+click+Pay+to+retry.`,
      request
    );
  }

  // Check if bank API reports failure / decline
  const isApiDeclinedOrFailed =
    apiStatus === 'AUTHORIZATION_FAILED' ||
    apiStatus === 'JUSPAY_DECLINED' ||
    apiStatus === 'DECLINED' ||
    apiStatus === 'FAILED' ||
    apiStatus === 'FAILURE' ||
    apiStatusId === 25 || // AUTHORIZATION_FAILED
    apiStatusId === 28 || // JUSPAY_DECLINED
    txnStatus === 'AUTHORIZATION_FAILED' ||
    txnStatus === 'DECLINED' ||
    txnStatus === 'FAILED';

  if (isApiDeclinedOrFailed) {
    paymentStore.markPaymentFailed(orderId, statusResponse?.resp_message || 'Payment declined by issuing bank');
    return safeRedirect(
      `/payment?step=pay&orderId=${encodeURIComponent(orderId)}&status=failed&msg=Payment+was+declined+by+bank.+Your+due+remains+pending;+click+Pay+to+retry.`,
      request
    );
  }

  // 4. SUCCESSFUL PAYMENT CONFIRMATION
  const isSuccess = apiStatus === 'CHARGED' || apiStatus === 'SUCCESS';

  if (isSuccess) {
    paymentStore.approvePayment(orderId, 'HDFC SmartGateway', txnId, bankRef);

    return safeRedirect(
      `/payment?step=thankyou&orderId=${encodeURIComponent(orderId)}&txnId=${encodeURIComponent(txnId)}&amount=${encodeURIComponent(String(expectedAmount))}&dueId=${encodeURIComponent(dueId)}&dueTitle=${encodeURIComponent(dueTitle)}&status=success`,
      request
    );
  }

  // 5. UNFINISHED / NEW / ABANDONED STATUS WHEN RETURNING TO PORTAL
  // If the candidate lands back on return_url while the bank status is still NEW, STARTED, or PENDING,
  // it signifies they pressed back, closed the gateway, or clicked cancel before completing payment.
  paymentStore.cancelPayment(orderId, 'Payment was cancelled or abandoned before authorization');
  return safeRedirect(
    `/payment?step=pay&orderId=${encodeURIComponent(orderId)}&status=cancelled&msg=Payment+session+was+cancelled+or+abandoned.+Your+fee+due+remains+pending;+click+Pay+to+retry.`,
    request
  );
}

export async function GET(request: Request) {
  return handleHdfcReturn(request);
}

export async function POST(request: Request) {
  return handleHdfcReturn(request);
}
