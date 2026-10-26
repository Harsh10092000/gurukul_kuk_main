import { NextResponse } from 'next/server';
import { paymentStore } from '@/lib/paymentStore';
import { getTestFeeDue } from '@/lib/testFeeDues';
import { createHdfcOrderSession, getPublicBaseUrl } from '@/lib/hdfc';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const candidateName = body.name || 'Test Candidate';
    const candidateEmail = body.email || 'test@gurukul.com';
    const candidatePhone = body.phone || '9876543210';
    const registrationNumber = body.registrationNumber || 'KUR-2026-9901';
    const dueId = typeof body.dueId === 'string' ? body.dueId.trim() : '';
    const clientReportedAmount = typeof body.amount === 'number' ? body.amount : undefined;
    const isRePay = Boolean(body.isRePay);

    if (!dueId) {
      return NextResponse.json(
        { error: 'Missing required field: dueId is required.' },
        { status: 400 }
      );
    }

    // 1. Server-side Due Verification & Anti-Tampering Check
    const result = await paymentStore.initiateOrder({
      dueId,
      candidateName,
      candidateEmail,
      candidatePhone,
      registrationNumber,
      clientReportedAmount,
      isRePay,
    });

    if (!result.success || !result.order) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          code: result.code,
        },
        { status: result.code === 'AMOUNT_TAMPERING_DETECTED' ? 403 : 400 }
      );
    }

    const order = result.order;

    // 2. Build HDFC SmartGateway Return URL
    const baseUrl = getPublicBaseUrl(request);
    const returnUrl = `${baseUrl}/api/payment/test/return?dueId=${encodeURIComponent(order.dueId)}&orderId=${encodeURIComponent(order.orderId)}`;

    // 3. Create Real Session on HDFC SmartGateway
    let session: any = null;
    try {
      session = await createHdfcOrderSession({
        orderId: order.orderId,
        customerId: `cust_${candidatePhone.replace(/\D/g, '').slice(-6) || 'test'}`,
        customerEmail: candidateEmail,
        customerPhone: candidatePhone,
        returnUrl,
        amount: order.amount,
        description: `Gurukul Kurukshetra: ${order.dueTitle} - ${candidateName}`,
        metadata: {
          candidateName,
          registrationNumber,
          dueId: order.dueId,
          dueTitle: order.dueTitle,
          amount: String(order.amount),
        },
      });
    } catch (err: any) {
      console.error('[HDFC SmartGateway Initiate Error]:', err);
      return NextResponse.json(
        {
          success: false,
          error: `HDFC SmartGateway Error: ${err?.message || 'Failed to initialize session with bank.'}`,
          details: err?.message,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      orderId: order.orderId,
      paymentUrl: session.paymentUrl,
      amount: order.amount,
      currency: order.currency,
      dueTitle: order.dueTitle,
      dueId: order.dueId,
      status: order.status,
      tamperProtected: true,
      message: 'HDFC SmartGateway session created successfully.',
    });
  } catch (error: any) {
    console.error('Error initiating test payment:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to initiate payment session.' },
      { status: 500 }
    );
  }
}
