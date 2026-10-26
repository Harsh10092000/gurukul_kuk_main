import { NextResponse } from 'next/server';
import { fetchHdfcOrderStatus, HDFC_CONFIG } from '@/lib/hdfc';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const orderId = (url.searchParams.get('order_id') || url.searchParams.get('orderId') || '').trim();

    if (!orderId) {
      return NextResponse.json({ error: 'Missing order_id query parameter' }, { status: 400 });
    }

    const statusResponse = await fetchHdfcOrderStatus(orderId);
    return NextResponse.json({
      success: true,
      orderId,
      merchantId: HDFC_CONFIG.MERCHANT_ID,
      status: statusResponse?.status,
      bankResponse: statusResponse,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch status from HDFC' },
      { status: 500 }
    );
  }
}
