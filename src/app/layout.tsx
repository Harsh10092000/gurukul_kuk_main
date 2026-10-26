import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'The Gurukul Kurukshetra - Student Fee & Payment Portal',
  description:
    'Official Student Fee Dues Ledger & Payment Portal for The Gurukul Kurukshetra with anti-tampering guards, double payment prevention, and instant receipts.',
  icons: {
    icon: '/logo-gurukul.png',
    apple: '/logo-gurukul.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-[#F8FAFC] text-slate-900 antialiased font-sans selection:bg-amber-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
