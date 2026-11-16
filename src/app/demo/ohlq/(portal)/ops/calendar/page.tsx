import { getTastings } from '@/lib/ohlq-demo/server';
import { todayET } from '@/lib/ohlq-demo/shared';
import { TastingCalendar } from '@/components/ohlq-demo/tasting-calendar';

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const tastings = (await getTastings()).filter((t) => t.status !== 'rejected');
  const first = tastings.filter((t) => t.status === 'approved').map((t) => t.event_date).sort()[0];
  const month = m && /^\d{4}-\d{2}$/.test(m) ? m : (first && first.slice(0, 7) > todayET().slice(0, 7) ? first.slice(0, 7) : todayET().slice(0, 7));
  return <TastingCalendar tastings={tastings} month={month} today={todayET()} />;
}
