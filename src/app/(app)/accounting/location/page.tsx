import Link from 'next/link';
import { getFinData, pickPeriod, ym } from '@/lib/fin/page-data';
import { indexLines, scopeMonths, twelveMonths } from '@/lib/fin/compute';
import { buildStatement } from '@/lib/fin/statement';
import { ACCOUNTING_PATH, addMonths, fmtMoney, monthShort, periodLabel } from '@/lib/fin/shared';
import { MonthPicker, Segments } from '@/components/accounting/controls';
import { OpenBanner } from '@/components/accounting/bits';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// One location, 12 months + YTD + variance. Replaces accounting's per-location tabs.
export default async function LocationPage({ searchParams }: { searchParams: Promise<{ m?: string; e?: string }> }) {
  const sp = await searchParams;
  const d = await getFinData();
  const period = pickPeriod(d, sp.m);
  const entities = d.entities.filter((e) => e.active);
  const entity = entities.find((e) => e.code === sp.e) ?? entities.find((e) => e.code === 'GV') ?? entities[0];
  const idx = indexLines(d.lines);
  const months = twelveMonths(period);
  const prev = addMonths(period, -1), ly = addMonths(period, -12);
  const columns = [
    ...months.map((m) => ({ key: m, entity: entity.code, months: [m] })),
    { key: 'ytd', entity: entity.code, months: scopeMonths(period, 'ytd') },
  ];
  const rows = buildStatement(idx, d.accounts, columns);
  const statuses = Object.fromEntries(d.periods.map((p) => [p.period, p.status]));
  const status = statuses[period];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker periods={d.loaded} value={period} statuses={statuses} />
        <Segments name="e" value={entity.code} options={entities.map((e) => ({ value: e.code, label: e.name }))} />
      </div>
      {status === 'open' && <OpenBanner period={period} />}
      <h2 className="text-lg font-semibold">{entity.name} <span className="text-sm font-normal text-muted-foreground">· 12 months to {periodLabel(period)} · YTD · variance for {periodLabel(period)}</span></h2>

      <div className="overflow-x-auto rounded-lg border bg-card" data-location-table>
        <table className="w-full min-w-[1200px] text-sm tabular-nums">
          <thead>
            <tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left">Account</th>
              {months.map((m) => (
                <th key={m} className={cn('px-2 py-2 text-right', m === period && 'bg-amber-50', !idx.has(m) && 'text-muted-foreground/50')}>
                  {monthShort(m)} {m.slice(2, 4)}{statuses[m] === 'open' ? '*' : ''}
                </th>
              ))}
              <th className="bg-muted/40 px-2 py-2 text-right">YTD</th>
              <th className="px-2 py-2 text-right">vs {monthShort(prev)}</th>
              <th className="px-2 py-2 text-right">vs {monthShort(ly)} {ly.slice(2, 4)}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              if (r.kind === 'section') return <tr key={r.key} className="border-t bg-muted/30"><td colSpan={months.length + 4} className="sticky left-0 bg-muted/30 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{r.label}</td></tr>;
              const cur = r.values[period], pm = r.values[prev], lyv = r.values[ly];
              const v1 = cur !== null && pm !== null ? cur - pm : null;
              const v2 = cur !== null && lyv !== null ? cur - lyv : null;
              return (
                <tr key={r.key} className={cn('border-t border-muted/60', r.kind !== 'account' && 'font-semibold', r.kind === 'profit' && 'border-t-2 border-foreground/30')}>
                  <td className="sticky left-0 z-10 max-w-[240px] truncate bg-card px-3 py-1.5" title={r.label}>
                    {r.gl ? <Link className="hover:underline" href={`${ACCOUNTING_PATH}/account/${r.gl}?m=${ym(period)}`}>{r.label}</Link> : r.label}
                  </td>
                  {months.map((m) => <td key={m} className={cn('px-2 py-1.5 text-right', m === period && 'bg-amber-50', (r.values[m] ?? 0) < 0 && 'text-red-700')}>{fmtMoney(r.values[m])}</td>)}
                  <td className="bg-muted/40 px-2 py-1.5 text-right">{fmtMoney(r.values.ytd)}</td>
                  <td className={cn('px-2 py-1.5 text-right text-xs', (v1 ?? 0) < 0 ? 'text-red-700' : 'text-emerald-700')}>{v1 === null ? '' : `${v1 > 0 ? '+' : ''}${fmtMoney(v1)}`}</td>
                  <td className={cn('px-2 py-1.5 text-right text-xs', (v2 ?? 0) < 0 ? 'text-red-700' : 'text-emerald-700')}>{v2 === null ? '' : `${v2 > 0 ? '+' : ''}${fmtMoney(v2)}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">* open month. Blank columns are months with no upload. Variance columns compare {periodLabel(period)} with the prior month and the same month last year.</p>
    </div>
  );
}
