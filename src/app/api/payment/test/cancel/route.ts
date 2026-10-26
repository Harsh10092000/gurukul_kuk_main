import { NextResponse } from 'next/server';
import { paymentStore } from '@/lib/paymentStore';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const orderId = (body.orderId || body.order_id || '').trim();
    const reason = body.reason || 'User cancelled checkout';

    if (!orderId) {
      return NextResponse.json(
        { error: 'Missing orderId parameter.' },
        { status: 400 }
      );
    }

    const result = await paymentStore.cancelPayment(orderId, reason);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Payment cancelled safely. Fee due remains unpaid.',
      orderId,
      status: 'CANCELLED',
      returnUrl: `/payment?step=pay&orderId=${encodeURIComponent(orderId)}&status=cancelled`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Cancellation failed.' },
      { status: 500 }
    );
  }
}
