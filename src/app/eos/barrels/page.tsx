import { getBarrels } from '@/lib/eos/barrels';
import BarrelsClient from './barrels-client';

export const dynamic = 'force-dynamic';

export default async function EosBarrelsPage() {
  const barrels = await getBarrels();
  return (
    <div className="px-6 py-8 text-white min-h-full">
      <div className="max-w-5xl mx-auto">
        <BarrelsClient initialBarrels={barrels} />
      </div>
    </div>
  );
}
