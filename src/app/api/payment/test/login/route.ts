import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const username = (body.username || body.email || '').trim().toLowerCase();
    const password = (body.password || '').trim();

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Please enter both Username/Email and Password.' },
        { status: 400 }
      );
    }

    const validEmail = (process.env.TEST_USER_EMAIL || 'test@gurukul.com').trim().toLowerCase();
    const validPassword = (process.env.TEST_USER_PASSWORD || 'Gurukul@Test2026').trim();

    if (username === validEmail && password === validPassword) {
      const userData = {
        id: 'usr_gurukul_test_01',
        name: 'Test Student / Parent',
        email: validEmail,
        phone: '9876543210',
        role: 'Verified Candidate',
        registrationNumber: 'KUR-2026-7861',
        campus: 'The Gurukul Kurukshetra (Main Campus)',
        classEnrolled: 'Class 8 (Vedic & Modern Studies)',
      };

      const response = NextResponse.json({
        success: true,
        message: 'Authenticated successfully with test credentials.',
        user: userData,
      });

      response.cookies.set('payment_test_session', JSON.stringify(userData), {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 24 * 60 * 60,
      });

      return response;
    }

    return NextResponse.json(
      {
        error: `Invalid credentials. Testing allowed only for ${validEmail} with your configured password.`,
      },
      { status: 401 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Login failed.' },
      { status: 500 }
    );
  }
}
