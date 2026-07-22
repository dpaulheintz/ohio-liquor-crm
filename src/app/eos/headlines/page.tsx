import type { Metadata } from 'next';
import { getHeadlines } from '@/lib/eos/headlines';

export const metadata: Metadata = { title: 'Headlines | High Bank EOS' };
import HeadlinesClient from './headlines-client';

export const dynamic = 'force-dynamic';

export default async function EosHeadlinesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const archived = view === 'archived';
  const headlines = await getHeadlines(archived);
  return (
    <div className="px-6 py-8 text-gray-900 min-h-full">
      <div className="max-w-3xl mx-auto">
        <HeadlinesClient initialHeadlines={headlines} archived={archived} />
      </div>
    </div>
  );
}
