import { NextResponse } from 'next/server';
import { paymentStore } from '@/lib/paymentStore';

export const dynamic = 'force-dynamic';

async function handleReset(request: Request) {
  try {
    const url = new URL(request.url);
    let registrationNumber = url.searchParams.get('registrationNumber') || url.searchParams.get('regNo');

    if (!registrationNumber && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      registrationNumber = body.registrationNumber || body.regNo;
    }

    const targetReg = registrationNumber ? registrationNumber.trim() : 'all';
    paymentStore.resetUserDues(targetReg);

    return NextResponse.json({
      success: true,
      registrationNumber: targetReg,
      message: targetReg === 'all'
        ? 'All test fee dues and ledgers have been reset to unpaid.'
        : `All dues for registration number ${targetReg} have been reset to unpaid.`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Reset failed.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return handleReset(request);
}

export async function GET(request: Request) {
  return handleReset(request);
}
