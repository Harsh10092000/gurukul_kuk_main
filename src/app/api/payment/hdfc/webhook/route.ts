import { NextResponse } from 'next/server';
import { paymentStore } from '@/lib/paymentStore';
import { fetchHdfcOrderStatus, verifyHdfcResponseSignature, HDFC_CONFIG } from '@/lib/hdfc';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature =
      request.headers.get('x-juspay-signature') ||
      request.headers.get('x-signature') ||
      '';

    // Verify cryptographic signature if secret is configured
    if (HDFC_CONFIG.RESPONSE_KEY && signature) {
      const isValid = verifyHdfcResponseSignature(signature, rawBody);
      if (!isValid) {
        console.error('[HDFC Webhook] Invalid signature verification');
        return NextResponse.json({ error: 'Signature verification failed' }, { status: 401 });
      }
    }

    let payload: any = {};
    try {
      payload = JSON.parse(rawBody);
    } catch {
      payload = {};
    }

    const orderId = payload.order_id || payload.orderId || payload.content?.order?.order_id;
    if (!orderId) {
      return NextResponse.json({ error: 'Missing order_id in webhook payload' }, { status: 400 });
    }

    const order = await paymentStore.getOrder(orderId);
    if (!order) {
      return NextResponse.json({ received: true, note: 'Order not found in store' });
    }

    // Server-to-server confirmation directly with HDFC Bank
    const bankStatus = await fetchHdfcOrderStatus(orderId);
    const status = (bankStatus?.status || '').toUpperCase();
    const txnId = bankStatus?.txn_id || bankStatus?.transaction_id || `TXN_${orderId.slice(-8)}`;
    const bankRef = bankStatus?.bank_ref_no || bankStatus?.payment_gateway_response?.rrn || `HDFC_${Date.now()}`;

    if (status === 'CHARGED' || status === 'SUCCESS') {
      await paymentStore.approvePayment(orderId, 'HDFC SmartGateway (Webhook)', txnId, bankRef);
      console.log(`[HDFC Webhook] Order ${orderId} successfully marked as CHARGED`);
    } else if (status === 'USER_ABORTED' || status === 'CANCELLED') {
      await paymentStore.cancelPayment(orderId, 'Webhook cancellation notification from bank');
      console.log(`[HDFC Webhook] Order ${orderId} marked as CANCELLED`);
    } else if (status === 'FAILED' || status === 'DECLINED') {
      await paymentStore.markPaymentFailed(orderId, bankStatus?.resp_message || 'Webhook failed notification from bank');
      console.log(`[HDFC Webhook] Order ${orderId} marked as FAILED`);
    }

    return NextResponse.json({ received: true, orderId, status });
  } catch (error: any) {
    console.error('[HDFC Webhook Error]:', error);
    return NextResponse.json({ error: error?.message || 'Webhook processing failed' }, { status: 500 });
  }
}
