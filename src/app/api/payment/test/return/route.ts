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

  // Copy all searchParams into body
  url.searchParams.forEach((val, key) => {
    body[key] = val;
  });

  if (request.method === 'POST') {
    try {
      const rawText = await request.text();
      console.log('[HDFC SmartGateway Return Raw Body]:', rawText);

      // Parse form-urlencoded
      if (rawText && rawText.includes('=')) {
        try {
          const formParams = new URLSearchParams(rawText);
          formParams.forEach((val, key) => {
            body[key] = val;
          });
          const formOrderId = formParams.get('order_id') || formParams.get('orderId');
          if (formOrderId) orderId = formOrderId;
        } catch (e) {
          console.warn('[HDFC Return] URLSearchParams parse error:', e);
        }
      }

      // Parse JSON
      if (rawText && (rawText.trim().startsWith('{') || rawText.trim().startsWith('['))) {
        try {
          const json = JSON.parse(rawText);
          Object.assign(body, json);
          if (json.order_id || json.orderId) {
            orderId = json.order_id || json.orderId;
          }
        } catch (e) {
          console.warn('[HDFC Return] JSON parse error:', e);
        }
      }
    } catch (e) {
      console.warn('Could not read POST body in HDFC test return handler:', e);
    }
  }

  console.log('[HDFC SmartGateway Return Extracted]:', {
    method: request.method,
    url: request.url,
    orderId,
    body,
  });

  return { orderId, body };
}

async function handleHdfcReturn(request: Request) {
  const { orderId, body } = await extractOrderParams(request);

  if (!orderId) {
    return safeRedirect('/payment?step=pay&status=error&msg=Missing+Order+Identifier', request);
  }

  const paymentOrder = await paymentStore.getOrder(orderId);
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
    body?.order_status ||
    body?.payment_status ||
    body?.txn_status ||
    body?.response_status ||
    urlObj.searchParams.get('status') ||
    urlObj.searchParams.get('payment') ||
    urlObj.searchParams.get('order_status') ||
    ''
  ).toUpperCase();

  const rawStatusId = Number(
    body?.status_id ||
    body?.order_status_id ||
    body?.payment_status_id ||
    urlObj.searchParams.get('status_id') ||
    urlObj.searchParams.get('statusId') ||
    0
  );

  const errorCode = (
    body?.error_code ||
    body?.errorCode ||
    body?.resp_code ||
    body?.response_code ||
    urlObj.searchParams.get('error_code') ||
    urlObj.searchParams.get('errorCode') ||
    ''
  ).toUpperCase();

  const errorMsg = (
    body?.error_message ||
    body?.errorMessage ||
    body?.resp_message ||
    body?.response_message ||
    body?.status_message ||
    body?.status_desc ||
    urlObj.searchParams.get('msg') ||
    urlObj.searchParams.get('error_message') ||
    ''
  ).toLowerCase();

  const isExplicitAbortOrCancel =
    rawStatus.includes('CANCEL') ||
    rawStatus.includes('ABORT') ||
    rawStatus.includes('AUTHENTICATION_FAILED') ||
    rawStatus.includes('AUTHORIZATION_FAILED') ||
    rawStatus.includes('DECLINED') ||
    rawStatus.includes('DROP') ||
    rawStatus.includes('FAIL') ||
    rawStatusId === 26 || // AUTHENTICATION_FAILED (Juspay standard code for OTP cancel/failure)
    rawStatusId === 27 || // USER_ABORTED / AUTHORIZATION_FAILED
    rawStatusId === 28 || // JUSPAY_DECLINED
    rawStatusId === 31 || // VOIDED / CANCELLED
    errorCode === 'JP_002' ||
    errorCode.includes('CANCEL') ||
    errorCode.includes('ABORT') ||
    errorCode.includes('FAIL') ||
    errorCode.includes('DECLINE') ||
    errorMsg.includes('abort') ||
    errorMsg.includes('cancel') ||
    errorMsg.includes('fail') ||
    errorMsg.includes('decline') ||
    urlObj.searchParams.get('status') === 'cancelled' ||
    urlObj.searchParams.get('status') === 'canceled';

  if (isExplicitAbortOrCancel) {
    console.log(`[HDFC SmartGateway Return] Order ${orderId} was cancelled/aborted by user (status: ${rawStatus}, status_id: ${rawStatusId}, msg: ${errorMsg})`);
    await paymentStore.cancelPayment(orderId, 'User cancelled payment at bank OTP / authorization screen');
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
      await paymentStore.cancelPayment(orderId, 'User aborted payment session at bank');
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
    apiStatus.includes('CANCEL') ||
    apiStatus.includes('ABORT') ||
    apiStatus.includes('AUTHENTICATION_FAILED') ||
    apiStatus.includes('DROP') ||
    apiStatusId === 26 || // AUTHENTICATION_FAILED
    apiStatusId === 27 || // USER_ABORTED
    apiStatusId === 31 || // VOIDED
    txnStatus.includes('CANCEL') ||
    txnStatus.includes('ABORT') ||
    txnStatus.includes('AUTHENTICATION_FAILED');

  if (isApiCancelled) {
    await paymentStore.cancelPayment(orderId, statusResponse?.resp_message || 'Payment cancelled or authentication aborted at bank OTP screen');
    return safeRedirect(
      `/payment?step=pay&orderId=${encodeURIComponent(orderId)}&status=cancelled&msg=Payment+authentication+was+cancelled+or+failed.+Your+due+remains+pending;+click+Pay+to+retry.`,
      request
    );
  }

  // Check if bank API reports failure / decline
  const isApiDeclinedOrFailed =
    apiStatus.includes('AUTHORIZATION_FAILED') ||
    apiStatus.includes('DECLINED') ||
    apiStatus.includes('FAIL') ||
    apiStatusId === 25 || // AUTHORIZATION_FAILED
    apiStatusId === 28 || // JUSPAY_DECLINED
    txnStatus.includes('AUTHORIZATION_FAILED') ||
    txnStatus.includes('DECLINED') ||
    txnStatus.includes('FAIL');

  if (isApiDeclinedOrFailed) {
    await paymentStore.markPaymentFailed(orderId, statusResponse?.resp_message || 'Payment declined by issuing bank');
    return safeRedirect(
      `/payment?step=pay&orderId=${encodeURIComponent(orderId)}&status=failed&msg=Payment+was+declined+by+bank.+Your+due+remains+pending;+click+Pay+to+retry.`,
      request
    );
  }

  // 4. SUCCESSFUL PAYMENT CONFIRMATION
  const isSuccess = apiStatus === 'CHARGED' || apiStatus === 'SUCCESS';

  if (isSuccess) {
    await paymentStore.approvePayment(orderId, 'HDFC SmartGateway', txnId, bankRef);

    return safeRedirect(
      `/payment?step=thankyou&orderId=${encodeURIComponent(orderId)}&txnId=${encodeURIComponent(txnId)}&amount=${encodeURIComponent(String(expectedAmount))}&dueId=${encodeURIComponent(dueId)}&dueTitle=${encodeURIComponent(dueTitle)}&status=success`,
      request
    );
  }

  // 5. UNFINISHED / NEW / ABANDONED STATUS WHEN RETURNING TO PORTAL
  // If the candidate lands back on return_url while the bank status is still NEW, STARTED, or PENDING,
  // it signifies they pressed back, closed the gateway, or clicked cancel before completing payment.
  await paymentStore.cancelPayment(orderId, 'Payment was cancelled or abandoned before authorization');
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
