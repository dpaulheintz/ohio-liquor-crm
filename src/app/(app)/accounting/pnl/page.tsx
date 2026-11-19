import Link from 'next/link';
import { getFinData, pickPeriod, ym } from '@/lib/fin/page-data';
import { TOTAL, indexLines, scopeMonths, type Scope } from '@/lib/fin/compute';
import { COMPARE_LABEL, buildStatement, compareMonths, netSalesOf, type Compare } from '@/lib/fin/statement';
import { ACCOUNTING_PATH, fmtMoney, fmtPct, periodLabel } from '@/lib/fin/shared';
import { MonthPicker, Segments } from '@/components/accounting/controls';
import { OpenBanner } from '@/components/accounting/bits';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const SCOPES: { value: Scope; label: string }[] = [{ value: 'month', label: 'Month' }, { value: 'ytd', label: 'YTD' }, { value: 't3m', label: 'Trailing 3 months' }];

export default async function PnlPage({ searchParams }: { searchParams: Promise<{ m?: string; s?: string; c?: string }> }) {
  const sp = await searchParams;
  const d = await getFinData();
  const period = pickPeriod(d, sp.m);
  const scope: Scope = sp.s === 'ytd' || sp.s === 't3m' ? sp.s : 'month';
  const compare: Compare = sp.c === 'pm' || sp.c === 'ly' ? sp.c : 'none';
  const idx = indexLines(d.lines);
  const entities = d.entities.filter((e) => e.active);
  const cols = [...entities.map((e) => ({ key: e.code, entity: e.code, label: e.name })), { key: TOTAL, entity: TOTAL, label: 'Total' }];
  const months = scopeMonths(period, scope);
  const rows = buildStatement(idx, d.accounts, cols.map((c) => ({ key: c.key, entity: c.entity, months })));
  const cmpMonths = compareMonths(period, scope, compare);
  const cmpRows = cmpMonths ? buildStatement(idx, d.accounts, cols.map((c) => ({ key: c.key, entity: c.entity, months: cmpMonths }))) : null;
  const cmpVal = (rowKey: string, col: string) => cmpRows?.find((r) => r.key === rowKey)?.values[col] ?? null;
  const missingMonths = months.filter((m) => !idx.has(m));
  const status = d.periods.find((p) => p.period === period)?.status;
  const statuses = Object.fromEntries(d.periods.map((p) => [p.period, p.status]));
  const scopeLabel = scope === 'month' ? periodLabel(period, 'long') : scope === 'ytd' ? `YTD through ${periodLabel(period)}` : `${periodLabel(months[0])} – ${periodLabel(period)}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker periods={d.loaded} value={period} statuses={statuses} />
        <Segments name="s" value={scope} options={SCOPES} />
        <Segments name="c" value={compare} options={[{ value: 'none', label: '% of sales' }, { value: 'pm', label: 'vs prior month' }, { value: 'ly', label: 'vs last year' }]} />
      </div>
      {status === 'open' && <OpenBanner period={period} />}
      <p className="text-sm text-muted-foreground">
        {scopeLabel} · second column: {COMPARE_LABEL[compare]}{cmpMonths ? ` (${cmpMonths.length === 1 ? periodLabel(cmpMonths[0]) : `${periodLabel(cmpMonths[0])} – ${periodLabel(cmpMonths.at(-1)!)}`})` : ''}
        {missingMonths.length > 0 && <span className="text-amber-700"> · no upload for {missingMonths.map((m) => periodLabel(m)).join(', ')}</span>}
        {cmpMonths && cmpMonths.every((m) => !idx.has(m)) && <span className="text-amber-700"> · no data to compare against</span>}
      </p>

      <div className="overflow-x-auto rounded-lg border bg-card" data-pnl-table>
        <table className="w-full min-w-[960px] text-sm tabular-nums">
          <thead className="sticky top-0 bg-card">
            <tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left">Account</th>
              {cols.map((c) => (
                <th key={c.key} colSpan={2} className={cn('px-2 py-2 text-center', c.key === TOTAL && 'bg-muted/40')}>
                  {c.key === TOTAL ? c.label : <Link className="hover:underline" href={`${ACCOUNTING_PATH}/location?m=${ym(period)}&e=${c.key}`}>{c.label}</Link>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              if (r.kind === 'section') return (
                <tr key={r.key} className="border-t bg-muted/30"><td colSpan={1 + cols.length * 2} className="sticky left-0 bg-muted/30 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{r.label}</td></tr>
              );
              const strong = r.kind !== 'account';
              return (
                <tr key={r.key} className={cn('border-t border-muted/60', strong && 'font-semibold', r.kind === 'profit' && 'border-t-2 border-foreground/30 text-base')}>
                  <td className="sticky left-0 z-10 max-w-[260px] truncate bg-card px-3 py-1.5" title={r.label}>
                    {r.gl ? <Link className="hover:underline" href={`${ACCOUNTING_PATH}/account/${r.gl}?m=${ym(period)}`}>{r.label}</Link> : r.label}
                  </td>
                  {cols.map((c) => {
                    const v = r.values[c.key];
                    let second: React.ReactNode = '';
                    if (compare === 'none') {
                      const ns = netSalesOf(rows, c.key);
                      second = v !== null && ns ? fmtPct(v / ns) : '';
                    } else {
                      const b = cmpVal(r.key, c.key);
                      if (v !== null && b !== null) {
                        const delta = v - b;
                        const pct = b !== 0 ? delta / Math.abs(b) : null;
                        second = delta === 0 ? '–' : <span className={delta < 0 ? 'text-red-700' : 'text-emerald-700'} title={pct !== null ? fmtPct(pct) : ''}>{delta > 0 ? '+' : ''}{fmtMoney(delta)}</span>;
                      }
                    }
                    return [
                      <td key={`${c.key}-v`} className={cn('px-2 py-1.5 text-right', c.key === TOTAL && 'bg-muted/40', v !== null && v < 0 && 'text-red-700')}>{fmtMoney(v)}</td>,
                      <td key={`${c.key}-s`} className={cn('px-2 py-1.5 text-right text-xs text-muted-foreground', c.key === TOTAL && 'bg-muted/40')}>{second}</td>,
                    ];
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Subtotals are recalculated from the account lines (they’re checked against the export’s own subtotals on every upload). Click an account for its trend.</p>
    </div>
  );
}
