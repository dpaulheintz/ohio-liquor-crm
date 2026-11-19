import { getFinData, pickPeriod } from '@/lib/fin/page-data';
import { FLAG_TYPE_LABEL } from '@/lib/fin/flags';
import { MonthPicker } from '@/components/accounting/controls';
import { OpenBanner } from '@/components/accounting/bits';
import { FlagsClient } from '@/components/accounting/flags-client';

export const dynamic = 'force-dynamic';

export default async function FlagsPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const d = await getFinData();
  const period = pickPeriod(d, (await searchParams).m);
  const statuses = Object.fromEntries(d.periods.map((p) => [p.period, p.status]));
  const accounts = Object.fromEntries(d.accounts.map((a) => [a.gl_number, a.name]));
  const entities = d.entities.filter((e) => e.active).map((e) => ({ code: e.code, name: e.name }));
  const rows = d.flags.filter((f) => f.period === period);
  const t = d.thresholds;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2"><MonthPicker periods={d.loaded} value={period} statuses={statuses} /></div>
      {statuses[period] === 'open' && <OpenBanner period={period} />}
      <FlagsClient key={period} flags={rows} accounts={accounts} entities={entities} typeLabels={FLAG_TYPE_LABEL} period={period} />
      <p className="text-xs text-muted-foreground">
        Rules: month-over-month change over {Math.round(t.mom_pct * 100)}% or year-over-year over {Math.round(t.yoy_pct * 100)}%, and over ${t.materiality.toLocaleString()};
        a charge over {t.large_multiple}× its trailing 3-month average; possible reclass when one account drops and another rises within {Math.round(t.reclass_tolerance * 100)}% (both over ${t.reclass_min.toLocaleString()});
        prime cost outside {Math.round(t.prime_min * 100)}–{Math.round(t.prime_max * 100)}% (or the location’s own range); sign flips; new, renamed and mapped accounts; open month.
        High = impact of ${t.high_priority.toLocaleString()} or more. Change thresholds in Settings.
      </p>
    </div>
  );
}
