import type { Metadata, Viewport } from 'next';
import { Big_Shoulders, Outfit } from 'next/font/google';
import './fraud.css';

// Same type as the Barrel Arcade: Big Shoulders for titles, Outfit for body.
const display = Big_Shoulders({ subsets: ['latin'], weight: ['800', '900'], variable: '--ft-display' });
const body = Outfit({ subsets: ['latin'], weight: ['300', '400', '600', '800'], variable: '--ft-body' });

export const metadata: Metadata = {
  title: 'Scam or Legit? | High Bank',
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { themeColor: '#130e0b', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function FraudTrainingLayout({ children }: { children: React.ReactNode }) {
  return <div className={`ft ${display.variable} ${body.variable}`}>{children}</div>;
}
