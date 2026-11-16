import Link from 'next/link';

/** "In process | History" tabs like the ops.ohlq.com Product Actions page. */
export function QueueTabs({ base, tab, counts }: { base: string; tab: 'open' | 'history'; counts: [number, number] }) {
  const style = (on: boolean) => ({
    flex: 1, textAlign: 'center' as const, padding: '10px 0 12px', font: '500 24px var(--ohlq-cond)', textTransform: 'uppercase' as const,
    color: on ? 'var(--ohlq-red)' : '#333', borderBottom: on ? '3px solid var(--ohlq-red)' : '3px solid #d6d6d6', textDecoration: 'none',
  });
  return (
    <div style={{ display: 'flex', marginBottom: 18 }} role="tablist">
      <Link role="tab" aria-selected={tab === 'open'} href={base} style={style(tab === 'open')}>In Process ({counts[0]})</Link>
      <Link role="tab" aria-selected={tab === 'history'} href={`${base}?tab=history`} style={style(tab === 'history')}>History ({counts[1]})</Link>
    </div>
  );
}
