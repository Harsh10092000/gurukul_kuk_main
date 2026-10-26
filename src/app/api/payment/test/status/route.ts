import { NextResponse } from 'next/server';
import { paymentStore, calculateOrderChecksum } from '@/lib/paymentStore';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const orderId = (url.searchParams.get('order_id') || url.searchParams.get('orderId') || '').trim();

    if (!orderId) {
      return NextResponse.json(
        { error: 'Missing order_id query parameter.' },
        { status: 400 }
      );
    }

    const order = paymentStore.getOrder(orderId);

    if (!order) {
      return NextResponse.json(
        { error: `Payment order ${orderId} not found.` },
        { status: 404 }
      );
    }

    // Verify cryptographic integrity
    const expectedChecksum = calculateOrderChecksum(
      order.orderId,
      order.dueId,
      order.amount,
      order.registrationNumber
    );
    const isIntegrityValid = order.checksum === expectedChecksum;

    return NextResponse.json({
      success: true,
      order: {
        orderId: order.orderId,
        dueId: order.dueId,
        dueTitle: order.dueTitle,
        amount: order.amount,
        currency: order.currency,
        status: order.status,
        candidateName: order.candidateName,
        candidateEmail: order.candidateEmail,
        candidatePhone: order.candidatePhone,
        registrationNumber: order.registrationNumber,
        txnId: order.txnId,
        paymentMethod: order.paymentMethod,
        bankRef: order.bankRef,
        createdAt: order.createdAt,
        paidAt: order.paidAt,
        cancelledAt: order.cancelledAt,
        cancelReason: order.cancelReason,
        isIntegrityValid,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Status query failed.' },
      { status: 500 }
    );
  }
}
