'use client';

import React, { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Lock,
  ShieldCheck,
  CreditCard,
  CheckCircle2,
  LogOut,
  ArrowRight,
  AlertCircle,
  AlertTriangle,
  Sparkles,
  KeyRound,
  Search,
  RotateCcw,
  Receipt,
  Printer,
  ChevronRight,
  ShieldAlert,
  Info,
  Clock,
  GraduationCap,
  Building2,
  Download,
  Eye,
  EyeOff,
  X,
  FileText,
  BadgeCheck,
} from 'lucide-react';
import { TEST_FEE_DUES, FeeDueItem, DueCategory } from '@/lib/testFeeDues';

interface TestUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  registrationNumber: string;
  campus?: string;
  classEnrolled?: string;
}

interface PaidDueRecord {
  dueId: string;
  orderId: string;
  txnId: string;
  amount: number;
  dueTitle: string;
  paidAt: string;
}

function PaymentTestingPortalContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const stepParam = searchParams.get('step');
  const orderId = searchParams.get('orderId') || searchParams.get('order_id') || '';
  const txnId = searchParams.get('txnId') || searchParams.get('txn_id') || '';
  const amountParam = searchParams.get('amount') || '';
  const statusParam = searchParams.get('status') || '';
  const dueIdParam = searchParams.get('dueId') || '';
  const dueTitleParam = searchParams.get('dueTitle') || '';
  const msgParam = searchParams.get('msg') || '';
  const isCancelled = statusParam === 'cancelled';
  const isFailed = statusParam === 'failed' || statusParam === 'error';

  // Auth & UI State
  const [currentUser, setCurrentUser] = useState<TestUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [payingDueId, setPayingDueId] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [securityNotice, setSecurityNotice] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // Form State for Login (Strictly using test@gurukul.com credentials)
  const defaultTestEmail = process.env.NEXT_PUBLIC_TEST_EMAIL || 'test@gurukul.com';
  const defaultTestPassword = process.env.NEXT_PUBLIC_TEST_PASSWORD || 'Gurukul@Test2026';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Dues Dashboard Filters & State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Paid'>('All');
  const [paidDues, setPaidDues] = useState<Record<string, PaidDueRecord>>({});
  const [toastMessage, setToastMessage] = useState<string>('');
  const [selectedReceipt, setSelectedReceipt] = useState<PaidDueRecord | null>(null);
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);
  const [resettingDues, setResettingDues] = useState(false);

  // Storage key for user dues
  const storageKey = currentUser?.registrationNumber
    ? `gurukul_kurukshetra_dues_${currentUser.registrationNumber}`
    : 'gurukul_kurukshetra_dues_test';

  // Read stored test session on mount
  useEffect(() => {
    try {
      const match = document.cookie
        .split('; ')
        .find((row) => row.startsWith('payment_test_session='));
      if (match) {
        const decoded = decodeURIComponent(match.split('=')[1]);
        const parsed = JSON.parse(decoded);
        if (parsed?.name) {
          setCurrentUser(parsed);
        }
      }
    } catch {
      // Ignore parse errors
    } finally {
      setLoading(false);
    }
  }, []);

  // Live sync with official server ledger (Single Source of Truth)
  const syncLedgerFromServer = useCallback(async (regNo?: string) => {
    const targetReg = regNo || currentUser?.registrationNumber || 'KUR-2026-7861';
    try {
      const res = await fetch(`/api/payment/test/ledger?registrationNumber=${encodeURIComponent(targetReg)}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.paidDues !== undefined) {
          setPaidDues(data.paidDues || {});
          try {
            const key = `gurukul_kurukshetra_dues_${targetReg}`;
            localStorage.setItem(key, JSON.stringify(data.paidDues || {}));
          } catch {}
          return;
        }
      }
    } catch (err) {
      console.warn('Could not sync ledger from server:', err);
    }

    // Only fallback to localStorage if server is unreachable
    try {
      const key = `gurukul_kurukshetra_dues_${targetReg}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        setPaidDues(JSON.parse(stored));
      } else {
        setPaidDues({});
      }
    } catch {}
  }, [currentUser?.registrationNumber]);

  // Synchronize on mount and whenever user changes
  useEffect(() => {
    if (currentUser?.registrationNumber) {
      syncLedgerFromServer(currentUser.registrationNumber);
    }
  }, [currentUser?.registrationNumber, syncLedgerFromServer]);

  // Handle return from payment gateway (Live Server Synchronization)
  useEffect(() => {
    if (!currentUser?.registrationNumber) return;

    // Refresh ledger directly from server to get official verified transaction particulars
    syncLedgerFromServer(currentUser.registrationNumber);

    try {
      sessionStorage.removeItem('last_test_due_pending');
    } catch {}
  }, [stepParam, statusParam, currentUser?.registrationNumber, syncLedgerFromServer]);

  // Handle Login Submission (Strictly test@gurukul.com)
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setLoginLoading(true);

    try {
      const res = await fetch('/api/payment/test/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || 'Invalid test credentials. Use test@gurukul.com');
        setLoginLoading(false);
        return;
      }

      setCurrentUser(data.user);
      router.replace('/payment?step=pay');
    } catch {
      setErrorMsg('Failed to connect to authentication service. Please verify server.');
    } finally {
      setLoginLoading(false);
    }
  };

  // Quick Autofill Test Credentials
  const handleQuickFill = () => {
    setUsername(defaultTestEmail);
    setPassword(defaultTestPassword);
    setErrorMsg('');
  };

  // Initiate Payment for a Specific Due
  const handleProceedToPayDue = async (due: FeeDueItem, isRePay = false) => {
    if (!currentUser) return;

    if (!isRePay && paidDues[due.id]) {
      setSecurityNotice(
        `Double Payment Guard: "${due.title}" (${due.id}) has already been paid under Order ${paidDues[due.id].orderId}. To re-test checkout, click Re-Pay.`
      );
      setTimeout(() => setSecurityNotice(''), 7000);
      return;
    }

    setPayingDueId(due.id);
    setErrorMsg('');
    setSecurityNotice('');

    try {
      sessionStorage.setItem(
        'last_test_due_pending',
        JSON.stringify({
          dueId: due.id,
          dueTitle: due.title,
          amount: due.amount,
        })
      );

      const res = await fetch('/api/payment/test/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: currentUser.name,
          email: currentUser.email,
          phone: currentUser.phone,
          registrationNumber: currentUser.registrationNumber,
          dueId: due.id,
          amount: due.amount,
          isRePay,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (data.code === 'AMOUNT_TAMPERING_DETECTED') {
          setSecurityNotice(
            `🛡️ ${data.error} The server rejected the altered amount and preserved financial integrity.`
          );
        } else if (data.code === 'ALREADY_PAID') {
          setSecurityNotice(`🛡️ ${data.error}`);
        } else {
          setErrorMsg(data.error || 'Failed to initialize payment gateway.');
        }
        setPayingDueId(null);
        return;
      }

      window.location.href = data.paymentUrl;
    } catch {
      setErrorMsg('Could not reach payment gateway service. Please check your connection.');
      setPayingDueId(null);
    }
  };

  // Reset All Dues (Test Helper) - Opens Custom Confirmation Modal
  const handleResetDues = () => {
    setShowResetConfirmModal(true);
  };

  const confirmResetDues = async () => {
    setResettingDues(true);
    const regNo = currentUser?.registrationNumber || 'KUR-2026-7861';
    try {
      await fetch('/api/payment/test/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationNumber: regNo }),
      });
    } catch {}

    setPaidDues({});
    try {
      localStorage.removeItem(storageKey);
      localStorage.removeItem('gurukul_kurukshetra_dues_test');
      localStorage.removeItem('gurukul_kurukshetra_dues_KUR-2026-7861');
      localStorage.removeItem('gurukul_kurukshetra_dues_KUR-2026-9901');
      sessionStorage.removeItem('last_test_due_pending');
    } catch {}

    await syncLedgerFromServer(regNo);
    setShowResetConfirmModal(false);
    setResettingDues(false);
    setToastMessage('All dues have been reset to Unpaid state.');
    setTimeout(() => setToastMessage(''), 3500);
  };

  // Handle Logout
  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/payment/test/logout', { method: 'POST' });
    } catch { }

    setCurrentUser(null);
    document.cookie = 'payment_test_session=; path=/; max-age=0;';
    setLoggingOut(false);
    router.replace('/payment');
  };

  // Filtered Dues Calculation
  const filteredDues = useMemo(() => {
    return TEST_FEE_DUES.filter((due) => {
      const isPaid = Boolean(paidDues[due.id]);

      if (statusFilter === 'Pending' && isPaid) return false;
      if (statusFilter === 'Paid' && !isPaid) return false;
      if (selectedCategory !== 'All' && due.category !== selectedCategory) {
        return false;
      }

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = due.title.toLowerCase().includes(query);
        const matchesCode = due.code.toLowerCase().includes(query);
        const matchesDesc = due.description.toLowerCase().includes(query);
        const matchesAmount = due.amount.toString().includes(query);
        if (!matchesTitle && !matchesCode && !matchesDesc && !matchesAmount) {
          return false;
        }
      }

      return true;
    });
  }, [paidDues, selectedCategory, statusFilter, searchQuery]);

  // Statistics
  const totalDuesCount = TEST_FEE_DUES.length;
  const paidDuesCount = Object.keys(paidDues).length;
  const pendingDuesCount = totalDuesCount - paidDuesCount;
  const totalPendingAmount = TEST_FEE_DUES.filter((d) => !paidDues[d.id]).reduce(
    (sum, d) => sum + d.amount,
    0
  );
  const totalPaidAmount = Object.values(paidDues).reduce((sum, d) => sum + d.amount, 0);

  const isThankYouStep = stepParam === 'thankyou' || statusParam === 'success';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center font-sans bg-[#F8FAFC]">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="w-16 h-16 border-4 border-slate-200 border-t-amber-500 rounded-full animate-spin" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-gurukul.png"
              alt="Logo"
              className="w-8 h-8 object-contain absolute inset-0 m-auto"
            />
          </div>
          <p className="text-xs font-bold text-slate-700 tracking-wide">
            Initializing Gurukul Kurukshetra Student &amp; Payment Portal...
          </p>
        </div>
      </div>
    );
  }

  const matchedThankYouDue =
    dueIdParam
      ? TEST_FEE_DUES.find((d) => d.id === dueIdParam)
      : TEST_FEE_DUES.find((d) => d.amount === parseFloat(amountParam));

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 font-sans antialiased pb-16">

      {/* Top Gold Accent Bar */}
      <div className="h-1.5 bg-gradient-to-r from-amber-500 via-amber-300 to-amber-600 w-full" />

      {/* Main Institutional Navigation Bar */}
      <header className="bg-[#071324] text-white border-b border-slate-800 shadow-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">

          {/* Logo & Institution Branding */}
          <div className="flex items-center gap-3.5">
            <div className="relative flex-shrink-0">
              <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-white p-1 ring-2 ring-amber-400/80 shadow-md flex items-center justify-center overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo-gurukul.png"
                  alt="The Gurukul Kurukshetra Emblem"
                  className="w-full h-full object-contain"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-amber-400 font-serif">
                  तमसो मा ज्योतिर्गमय
                </span>
                <span className="hidden sm:inline-block text-[10px] text-slate-400">• Estd. 1912</span>
              </div>
              <h1 className="text-base sm:text-lg font-black tracking-tight text-white leading-tight">
                THE GURUKUL KURUKSHETRA
              </h1>
              <p className="text-[11px] text-slate-300 font-medium hidden sm:block">
                Affiliated to CBSE, New Delhi • Official Fee &amp; Payment Ledger
              </p>
            </div>
          </div>

          {/* Right Status Controls */}
          <div className="flex items-center gap-3">
            <div className="hidden md:flex flex-col items-end text-right">
              <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 uppercase tracking-wider">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> 256-Bit SSL Encrypted
              </span>
              <span className="text-[11px] text-slate-300 font-mono">
                Merchant MID: <strong className="text-white">SG6464</strong>
              </span>
            </div>

            {currentUser && (
              <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-1.5">
                <div className="w-7 h-7 rounded-full bg-amber-500 text-slate-900 font-bold text-xs flex items-center justify-center">
                  {currentUser.name.charAt(0)}
                </div>
                <div className="hidden sm:block text-left text-xs leading-tight">
                  <div className="font-bold text-slate-100">{currentUser.name}</div>
                  <div className="text-[10px] text-slate-400 font-mono">{currentUser.registrationNumber}</div>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  title="Sign Out"
                  className="ml-1 text-slate-400 hover:text-rose-400 transition p-1"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 space-y-6">

        {/* Cancellation Notice Banner */}
        {isCancelled && !isThankYouStep && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-start gap-3 shadow-xs animate-in fade-in">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold text-amber-950 block">Payment Cancellation Recorded</span>
              <p className="text-amber-800 leading-relaxed">
                {msgParam || 'The gateway checkout was safely cancelled. Your due was not charged and remains securely pending in your ledger.'}
              </p>
            </div>
          </div>
        )}

        {/* Failed / Declined Notice Banner */}
        {isFailed && !isThankYouStep && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-900 flex items-start gap-3 shadow-xs animate-in fade-in">
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold text-rose-950 block">Payment Attempt Failed / Declined</span>
              <p className="text-rose-800 leading-relaxed">
                {msgParam || 'The banking gateway was unable to complete the transaction. Your fee due remains pending; you may click Pay to retry.'}
              </p>
            </div>
          </div>
        )}

        {/* Security Alert / Notice */}
        {securityNotice && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-900 flex items-start gap-3 shadow-xs animate-in fade-in">
            <ShieldAlert className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold text-rose-950 block">Security Guard Triggered</span>
              <p className="text-rose-800 leading-relaxed font-medium">{securityNotice}</p>
            </div>
          </div>
        )}

        {/* Toast Notification */}
        {toastMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs rounded-xl flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span className="font-semibold">{toastMessage}</span>
          </div>
        )}

        {/* =========================================================================
            STATE 3: THANK YOU SCREEN (OFFICIAL SIMULATED RECEIPT)
           ========================================================================= */}
        {isThankYouStep ? (
          <div className="max-w-2xl mx-auto bg-white border border-slate-200 rounded-3xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-emerald-700 via-teal-700 to-emerald-800 p-6 sm:p-8 text-white text-center relative overflow-hidden">
              <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none" />
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg ring-4 ring-white/20">
                <CheckCircle2 className="w-10 h-10 text-emerald-600" />
              </div>
              <span className="text-[11px] font-mono font-bold uppercase tracking-widest bg-white/20 px-3.5 py-1 rounded-full inline-block mb-1.5">
                Official Transaction Verified
              </span>
              <h2 className="text-2xl font-black tracking-tight">
                Payment Received &amp; Authorized!
              </h2>
              <p className="text-xs text-emerald-100 max-w-md mx-auto mt-1">
                The transaction has been cleared by the banking gateway. Your ledger record has been updated idempotently.
              </p>
            </div>

            {/* Receipt Particulars */}
            <div className="p-6 sm:p-8 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 sm:col-span-2">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                    Settled Fee Item
                  </span>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-sm">
                      {dueTitleParam || matchedThankYouDue?.title || 'Fee Due Surcharge'}
                    </span>
                    {(dueIdParam || matchedThankYouDue?.code) && (
                      <span className="text-[11px] font-mono bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 rounded font-bold">
                        {dueIdParam || matchedThankYouDue?.code}
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                    Gateway Status
                  </span>
                  <span className="font-mono font-bold text-emerald-700 text-sm mt-0.5 block flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    CHARGED / APPROVED
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200">
                  <span className="text-[10px] uppercase font-bold text-emerald-800 block tracking-wider">
                    Amount Paid
                  </span>
                  <span className="font-black text-emerald-900 text-lg mt-0.5 block font-mono">
                    ₹{parseFloat(amountParam || String(matchedThankYouDue?.amount || 2)).toFixed(2)} INR
                  </span>
                </div>

                {txnId && (
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 sm:col-span-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                      Gateway Transaction Reference
                    </span>
                    <span className="font-mono font-bold text-slate-900 text-xs mt-0.5 block break-all">
                      {txnId}
                    </span>
                  </div>
                )}

                {orderId && (
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 sm:col-span-2">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                      Merchant Order ID
                    </span>
                    <span className="font-mono text-slate-700 text-xs mt-0.5 block break-all">
                      {orderId}
                    </span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => router.replace('/payment?step=pay')}
                  className="w-full btn-gold text-xs h-12 justify-center gap-2 font-bold shadow-md rounded-xl transition-all"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>Return to Ledger</span>
                </button>

                {matchedThankYouDue && (
                  <button
                    type="button"
                    onClick={() => handleProceedToPayDue(matchedThankYouDue, true)}
                    className="w-full btn-secondary text-xs h-12 justify-center gap-2 text-slate-800 font-bold rounded-xl transition-all border border-slate-300 hover:bg-slate-100"
                  >
                    <RotateCcw className="w-4 h-4 text-slate-600" />
                    <span>Re-Pay (₹{matchedThankYouDue.amount.toFixed(2)})</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const record: PaidDueRecord = {
                      dueId: dueIdParam || 'DUE-01',
                      orderId: orderId || 'ORD-TEST',
                      txnId: txnId || 'TXN-TEST',
                      amount: parseFloat(amountParam || '2'),
                      dueTitle: dueTitleParam || matchedThankYouDue?.title || 'Fee Due Surcharge',
                      paidAt: new Date().toLocaleDateString('en-IN'),
                    };
                    setSelectedReceipt(record);
                  }}
                  className="w-full btn-secondary text-xs h-12 justify-center gap-2 text-slate-800 font-bold rounded-xl transition-all"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Voucher</span>
                </button>
              </div>
            </div>
          </div>
        ) : !currentUser ? (
          /* =========================================================================
              STATE 1: LOGIN SCREEN (TEST CREDENTIALS STRICTLY ENFORCED)
             ========================================================================= */
          <div className="max-w-xl mx-auto space-y-6">

            {/* Login Card */}
            <div className="bg-white border border-slate-200/90 rounded-3xl shadow-xl p-6 sm:p-8 space-y-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-36 h-36 bg-amber-400/10 rounded-full blur-2xl pointer-events-none" />

              <div className="space-y-2 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-900 text-amber-400 flex items-center justify-center mx-auto shadow-md ring-4 ring-amber-100 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/logo-gurukul.png"
                    alt="Gurukul Logo"
                    className="w-full h-full object-contain"
                  />
                </div>
                <h2 className="text-xl font-black text-slate-900 tracking-tight pt-1">
                  Student Fee Ledger Sign In
                </h2>
                <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                  Enter authorized testing credentials to review student fee dues (&lt; ₹100) and verify simulated banking checkout.
                </p>
              </div>

              {/* Dedicated Testing Credentials Box */}
              <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50/60 border border-amber-200 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-bold text-amber-950">Active Testing Credentials</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleQuickFill}
                    className="text-[11px] font-bold text-amber-900 bg-amber-200/80 hover:bg-amber-300 px-2.5 py-1 rounded-lg transition"
                  >
                    1-Click Auto Fill
                  </button>
                </div>

                <div className="bg-white/90 rounded-xl p-3 border border-amber-200/80 text-xs font-mono space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Test Email:</span>
                    <strong className="text-slate-900">{defaultTestEmail}</strong>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Password:</span>
                    <strong className="text-slate-900">{defaultTestPassword}</strong>
                  </div>
                </div>

                <p className="text-[10px] text-amber-800">
                  Configured strictly via <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">.env</code> file. Unauthorized accounts are blocked.
                </p>
              </div>

              {errorMsg && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                    Testing Username / Email
                  </label>
                  <input
                    type="email"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="test@gurukul.com"
                    className="input-field text-xs py-2.5 w-full"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                      className="input-field text-xs pl-9 pr-10 py-2.5 w-full font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loginLoading}
                  className="w-full btn-primary text-xs py-3.5 font-bold justify-center shadow-lg bg-[#071324] hover:bg-slate-900 text-white rounded-xl gap-2 transition-all"
                >
                  {loginLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Sign In to Access Student Dues Ledger</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        ) : (
          /* =========================================================================
              STATE 2: DUES DASHBOARD (STUDENT LOGGED IN)
             ========================================================================= */
          <div className="space-y-6">

            {/* Student Profile & Quick Actions Banner */}
            <div className="bg-gradient-to-r from-[#071324] via-[#0b192c] to-[#122849] border border-slate-800 rounded-3xl shadow-lg p-5 sm:p-6 text-white flex flex-wrap items-center justify-between gap-5 relative overflow-hidden">
              <div className="absolute right-0 top-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

              <div className="flex items-center gap-4 relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-amber-400 text-slate-950 flex items-center justify-center font-black text-2xl shadow-md ring-2 ring-amber-300">
                  {currentUser.name.charAt(0)}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base sm:text-lg font-black text-white">{currentUser.name}</span>
                    <span className="text-[10px] bg-amber-400 text-slate-950 font-mono font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <BadgeCheck className="w-3 h-3 text-slate-950" /> {currentUser.registrationNumber}
                    </span>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                      Verified Scholar
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">
                    {currentUser.classEnrolled || 'Class 8 (Vedic & Modern Studies)'} • {currentUser.campus || 'The Gurukul Kurukshetra Main Campus'}
                  </p>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                    Email: {currentUser.email} • Academic Session 2026-27
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 relative z-10">
                <button
                  type="button"
                  onClick={handleResetDues}
                  className="text-xs font-bold px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-1.5 shadow-sm"
                  title="Reset all paid dues back to unpaid"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                  <span>Reset All Dues</span>
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="text-xs font-bold px-3.5 py-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 transition flex items-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>

            {/* Financial Metrics Overview Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:border-slate-300 transition">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Total Dues Catalog
                </span>
                <span className="text-2xl sm:text-3xl font-black text-slate-900 mt-1 block">
                  {totalDuesCount}
                </span>
                <span className="text-[11px] text-slate-500">All test fees strictly &lt; ₹100</span>
              </div>

              <div className="p-5 rounded-2xl bg-white border border-amber-200 shadow-xs hover:border-amber-300 transition">
                <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider block">
                  Pending Balance
                </span>
                <span className="text-2xl sm:text-3xl font-black text-amber-600 mt-1 block font-mono">
                  ₹{totalPendingAmount.toFixed(2)}
                </span>
                <span className="text-[11px] text-amber-700 font-bold">
                  {pendingDuesCount} Outstanding Due{pendingDuesCount !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="p-5 rounded-2xl bg-white border border-emerald-200 shadow-xs hover:border-emerald-300 transition">
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">
                  Amount Cleared
                </span>
                <span className="text-2xl sm:text-3xl font-black text-emerald-600 mt-1 block font-mono">
                  ₹{totalPaidAmount.toFixed(2)}
                </span>
                <span className="text-[11px] text-emerald-700 font-bold">
                  {paidDuesCount} Settled Voucher{paidDuesCount !== 1 ? 's' : ''}
                </span>
              </div>

              <div className="p-5 rounded-2xl bg-gradient-to-br from-[#071324] to-[#122849] text-white shadow-md">
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                  Payment Gateway
                </span>
                <span className="text-lg font-black text-white mt-1 block flex items-center gap-1.5">
                  <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  HDFC SmartGateway
                </span>
                <span className="text-[11px] text-slate-300">Merchant ID: SG6464</span>
              </div>
            </div>

            {/* Filter Controls & Search */}
            <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs space-y-3.5">
              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div className="relative w-full sm:w-96">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search dues by fee title, code, or amount..."
                    className="input-field pl-10 text-xs w-full"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 text-xs"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Status Tabs */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto">
                  {(['All', 'Pending', 'Paid'] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatusFilter(st)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${statusFilter === st
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                        }`}
                    >
                      {st} {st === 'Pending' ? `(${pendingDuesCount})` : st === 'Paid' ? `(${paidDuesCount})` : `(${totalDuesCount})`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category Pills */}
              <div className="flex items-center gap-1.5 flex-wrap pt-2.5 border-t border-slate-100">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">
                  Category:
                </span>
                {[
                  'All',
                  'Administrative',
                  'Academics',
                  'Hostel & Dining',
                  'Sports & Gym',
                  'Labs & Practical',
                  'Activities & Camp',
                ].map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${selectedCategory === cat
                      ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                      }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Dues Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredDues.map((due) => {
                const isPaid = Boolean(paidDues[due.id]);
                const isPayingThis = payingDueId === due.id;

                return (
                  <div
                    key={due.id}
                    className={`bg-white rounded-2xl border transition-all duration-200 p-5 flex flex-col justify-between space-y-4 ${isPaid
                      ? 'border-emerald-200 bg-emerald-50/20 shadow-xs ring-1 ring-emerald-100'
                      : 'border-slate-200 hover:border-amber-400 hover:shadow-md'
                      }`}
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                          {due.code}
                        </span>

                        <span
                          className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${isPaid
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1'
                            : 'bg-amber-100 text-amber-900 border border-amber-200'
                            }`}
                        >
                          {isPaid ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-emerald-700" /> PAID
                            </>
                          ) : (
                            'PENDING'
                          )}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wide block">
                          {due.category}
                        </span>
                        <h3 className="text-sm font-bold text-slate-900 mt-0.5 line-clamp-1">
                          {due.title}
                        </h3>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                          {due.description}
                        </p>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono pt-1">
                        <span>Due: {due.dueDate}</span>
                        <span>{due.academicTerm}</span>
                      </div>
                    </div>

                    <div className="pt-3.5 border-t border-slate-100 space-y-2.5">
                      <div className="flex items-baseline justify-between">
                        <span className="text-[10px] uppercase font-bold text-slate-400">Total Due Amount</span>
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-black text-slate-900 font-mono">₹{due.amount.toFixed(2)}</span>
                          <span className="text-[10px] text-slate-400 font-mono">INR</span>
                        </div>
                      </div>

                      {isPaid ? (
                        <div className="space-y-2">
                          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1.5">
                            <div className="flex items-center justify-between text-xs text-emerald-950 font-bold">
                              <span className="flex items-center gap-1 text-emerald-700">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                Settled in Ledger
                              </span>
                              <button
                                type="button"
                                onClick={() => setSelectedReceipt(paidDues[due.id])}
                                className="text-[11px] font-bold text-indigo-700 hover:text-indigo-900 flex items-center gap-0.5 underline"
                              >
                                <FileText className="w-3 h-3" />
                                <span>View Receipt</span>
                              </button>
                            </div>
                            <span className="text-[10px] text-emerald-700 font-mono block truncate">
                              Txn: {paidDues[due.id].txnId}
                            </span>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleProceedToPayDue(due, true)}
                            disabled={isPayingThis || payingDueId !== null}
                            title="Re-test payment gateway for this due"
                            className="w-full text-xs text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 py-2 px-3 rounded-xl font-bold transition-all border border-slate-300 flex items-center justify-center gap-1.5 shadow-xs"
                          >
                            {isPayingThis ? (
                              <div className="w-3.5 h-3.5 border-2 border-slate-600 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
                            )}
                            <span>Re-Pay Due (₹{due.amount.toFixed(2)})</span>
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <button
                            type="button"
                            disabled={isPayingThis}
                            onClick={() => handleProceedToPayDue(due)}
                            className="w-full btn-gold text-xs py-2.5 font-bold justify-center rounded-xl shadow-xs gap-1.5 transition-all"
                          >
                            {isPayingThis ? (
                              <div className="w-4 h-4 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <>
                                <CreditCard className="w-3.5 h-3.5 text-slate-900" />
                                <span>Pay Due (₹{due.amount.toFixed(2)})</span>
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredDues.length === 0 && (
              <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 space-y-2">
                <p className="text-sm font-bold text-slate-700">No dues found matching filter criteria</p>
                <p className="text-xs text-slate-400">Try clearing your search query or switching categories.</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* =========================================================================
          OFFICIAL PRINTABLE RECEIPT MODAL
         ========================================================================= */}
      {selectedReceipt && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95">

            {/* Modal Header */}
            <div className="bg-[#071324] text-white p-5 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <Receipt className="w-5 h-5 text-amber-400" />
                <span className="text-sm font-bold">Official Payment Voucher</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReceipt(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Printable Receipt Body */}
            <div className="p-6 space-y-5 text-xs text-slate-800">
              {/* Institution Header */}
              <div className="text-center pb-4 border-b border-slate-200">
                <div className="w-14 h-14 mx-auto mb-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo-gurukul.png" alt="Logo" className="w-full h-full object-contain" />
                </div>
                <h3 className="text-base font-black text-slate-900 tracking-tight">THE GURUKUL KURUKSHETRA</h3>
                <p className="text-[11px] text-slate-500">Affiliated to CBSE, New Delhi • Established 1912</p>
                <p className="text-[10px] text-amber-700 font-serif font-bold italic mt-0.5">तमसो मा ज्योतिर्गमय</p>
              </div>

              {/* Student & Particulars */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Student Name:</span>
                  <strong className="text-slate-900">{currentUser?.name || 'Test Scholar'}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Registration Number:</span>
                  <span className="font-mono font-bold text-slate-900">{currentUser?.registrationNumber || 'KUR-2026-7861'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Fee Particular:</span>
                  <span className="font-semibold text-slate-900">{selectedReceipt.dueTitle}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Order ID:</span>
                  <span className="font-mono text-slate-700">{selectedReceipt.orderId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Transaction Ref:</span>
                  <span className="font-mono text-slate-700">{selectedReceipt.txnId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Date &amp; Time:</span>
                  <span className="font-mono text-slate-700">{selectedReceipt.paidAt}</span>
                </div>
              </div>

              {/* Total Paid Block */}
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-800 block">Total Amount Settled</span>
                  <span className="text-xs text-emerald-700 font-medium">Digital Banking Clearance</span>
                </div>
                <span className="text-xl font-black text-emerald-950 font-mono">
                  ₹{selectedReceipt.amount.toFixed(2)} INR
                </span>
              </div>

              {/* Security Seal */}
              <div className="text-center pt-2 text-[10px] text-slate-400 space-y-1">
                <p>Digitally signed &amp; verified by Gurukul Kurukshetra Accounts Division.</p>
                <p className="font-mono text-[9px]">Hash: SHA256-IDEMPOTENT-VERIFIED-VOUCHER</p>
              </div>

              {/* Modal Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="flex-1 btn-gold text-xs h-11 justify-center gap-2 font-bold shadow-md rounded-xl"
                >
                  <Printer className="w-4 h-4" />
                  <span>Print Receipt</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedReceipt(null)}
                  className="btn-secondary text-xs h-11 px-5 rounded-xl font-bold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom Reset All Dues Confirmation Modal */}
      {showResetConfirmModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => {
            if (!resettingDues) setShowResetConfirmModal(false);
          }}
        >
          <div
            className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Institutional Gold Accent Line */}
            <div className="h-1.5 bg-gradient-to-r from-amber-500 via-amber-300 to-amber-600 w-full" />

            <div className="p-6 sm:p-7 space-y-5">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center flex-shrink-0 ring-4 ring-amber-50">
                  <RotateCcw className="w-6 h-6 text-amber-600" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                    Reset All Fee Dues?
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    This action will reset all student dues back to <strong className="text-slate-800">Unpaid / Pending</strong> status for fresh test checkouts.
                  </p>
                </div>
              </div>

              {/* Warning Notice Box */}
              <div className="p-3.5 rounded-2xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-amber-950">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                  <span>Test Ledger Purge Notice</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  All cached vouchers and server transaction ledger records for candidate <strong>{currentUser?.registrationNumber || 'KUR-2026-7861'}</strong> will be wiped.
                </p>
              </div>

              {/* Modal Buttons */}
              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  disabled={resettingDues}
                  onClick={() => setShowResetConfirmModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={resettingDues}
                  onClick={confirmResetDues}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black text-xs shadow-md hover:shadow-lg transition flex items-center gap-2 disabled:opacity-50"
                >
                  {resettingDues ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Resetting Dues...</span>
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-3.5 h-3.5 text-slate-950" />
                      <span>Confirm &amp; Reset All</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PaymentTestingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-amber-500 rounded-full animate-spin" />
        </div>
      }
    >
      <PaymentTestingPortalContent />
    </Suspense>
  );
}
