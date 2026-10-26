import { NextResponse } from 'next/server';
import { paymentStore } from '@/lib/paymentStore';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const orderId = (body.orderId || body.order_id || '').trim();
    const paymentMethod = body.paymentMethod || 'Instant Approved Gateway Simulator';

    if (!orderId) {
      return NextResponse.json(
        { error: 'Missing orderId parameter.' },
        { status: 400 }
      );
    }

    const result = await paymentStore.approvePayment(orderId, paymentMethod);

    if (!result.success || !result.order) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          code: result.code,
        },
        { status: 400 }
      );
    }

    const order = result.order;

    return NextResponse.json({
      success: true,
      orderId: order.orderId,
      txnId: order.txnId,
      dueId: order.dueId,
      dueTitle: order.dueTitle,
      amount: order.amount,
      currency: order.currency,
      status: order.status,
      paidAt: order.paidAt,
      isDuplicate: result.isDuplicate || false,
      returnUrl: `/payment?step=thankyou&orderId=${encodeURIComponent(order.orderId)}&txnId=${encodeURIComponent(order.txnId || '')}&amount=${encodeURIComponent(String(order.amount))}&dueId=${encodeURIComponent(order.dueId)}&dueTitle=${encodeURIComponent(order.dueTitle)}&status=success`,
    });
  } catch (error: any) {
    console.error('Error approving test payment:', error);
    return NextResponse.json(
      { error: error?.message || 'Payment approval failed.' },
      { status: 500 }
    );
  }
}
