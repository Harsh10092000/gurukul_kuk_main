import { NextResponse } from 'next/server';
import { paymentStore } from '@/lib/paymentStore';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const registrationNumber = url.searchParams.get('registrationNumber') || url.searchParams.get('regNo') || '';

    if (!registrationNumber) {
      return NextResponse.json(
        { error: 'Missing registrationNumber query parameter.' },
        { status: 400 }
      );
    }

    const ledger = await paymentStore.getUserLedger(registrationNumber);

    return NextResponse.json({
      success: true,
      registrationNumber,
      paidDues: ledger.paidDues || {},
      count: Object.keys(ledger.paidDues || {}).length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch ledger.' },
      { status: 500 }
    );
  }
}
