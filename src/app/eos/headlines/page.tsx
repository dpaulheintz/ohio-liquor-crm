import type { Metadata } from 'next';
import { getHeadlines } from '@/lib/eos/headlines';

export const metadata: Metadata = { title: 'Headlines | High Bank EOS' };
import HeadlinesClient from './headlines-client';

export const dynamic = 'force-dynamic';

export default async function EosHeadlinesPage() {
  const headlines = await getHeadlines();
  return (
    <div className="px-6 py-8 text-white min-h-full">
      <div className="max-w-3xl mx-auto">
        <HeadlinesClient initialHeadlines={headlines} />
      </div>
    </div>
  );
}
