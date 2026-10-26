'use client';

import React, { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck, ArrowLeft, Loader2 } from 'lucide-react';

function PaymentGatewayInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = searchParams.get('order_id') || searchParams.get('orderId') || '';

  useEffect(() => {
    // Official gateway payments are hosted directly on HDFC SmartGateway servers.
    // If a user navigates to this legacy simulator URL, redirect them back to the fee portal.
    const timer = setTimeout(() => {
      router.replace(orderId ? `/payment?step=pay&orderId=${encodeURIComponent(orderId)}` : '/payment');
    }, 2000);
    return () => clearTimeout(timer);
  }, [router, orderId]);

  return (
    <div className="min-h-screen bg-slate-900 text-white flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-800 border border-slate-700 rounded-3xl p-8 text-center space-y-5 shadow-2xl">
        <div className="w-16 h-16 bg-blue-600/20 text-blue-400 rounded-2xl flex items-center justify-center mx-auto border border-blue-500/30">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold">HDFC SmartGateway</h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            All payments are processed securely through HDFC Bank&apos;s hosted payment gateway. Simulated checkout has been deprecated in favor of official banking encryption.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 text-xs text-blue-400 font-mono">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Redirecting to payment portal...</span>
        </div>
        <div className="pt-3 border-t border-slate-700">
          <Link
            href="/payment?step=pay"
            className="inline-flex items-center gap-2 text-xs text-slate-300 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" /> Return to Student Fee Portal
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function PaymentGatewayPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-900" />}>
      <PaymentGatewayInner />
    </Suspense>
  );
}
