import type { Metadata } from 'next';
import { getBarrels } from '@/lib/eos/barrels';

export const metadata: Metadata = { title: 'Barrels | High Bank EOS' };
import BarrelsClient from './barrels-client';

export const dynamic = 'force-dynamic';

export default async function EosBarrelsPage() {
  const barrels = await getBarrels();
  return (
    <div className="px-6 py-8 text-gray-900 min-h-full">
      <div className="max-w-5xl mx-auto">
        <BarrelsClient initialBarrels={barrels} />
      </div>
    </div>
  );
}
