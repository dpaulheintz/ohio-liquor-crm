import type { Metadata } from 'next';
import { Oswald } from 'next/font/google';
import './ohlq.css';

const oswald = Oswald({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-oswald' });

// OHLQ Ops concept demo. Not linked from the CRM; never indexed.
export const metadata: Metadata = {
  title: 'OHLQ Ops — Concept Demo',
  description: 'Concept demo prepared by High Bank Distillery. Not an official OHLQ system.',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default function OhlqDemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`ohlq ${oswald.variable}`}>
      <div className="ohlq-ribbon" data-demo-ribbon>
        Concept demo prepared by <b>High Bank Distillery</b> · Not an official OHLQ system · Sample data
      </div>
      {children}
    </div>
  );
}
