import { getFinData, pickPeriod } from '@/lib/fin/page-data';
import { indexLines } from '@/lib/fin/compute';
import { MonthPicker } from '@/components/accounting/controls';
import { OpenBanner } from '@/components/accounting/bits';
import { ChecklistClient } from '@/components/accounting/checklist-client';
import { periodLabel } from '@/lib/fin/shared';

export const dynamic = 'force-dynamic';

export default async function ChecklistPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const d = await getFinData();
  const period = pickPeriod(d, (await searchParams).m);
  const statuses = Object.fromEntries(d.periods.map((p) => [p.period, p.status]));
  const idx = indexLines(d.lines);
  const accounts = Object.fromEntries(d.accounts.map((a) => [a.gl_number, a.name]));
  const entities = d.entities.filter((e) => e.active).map((e) => ({ code: e.code, name: e.name }));
  const items = d.checklist.filter((c) => c.period === period).map((c) => ({
    ...c, current: idx.get(period)?.get(c.entity_code)?.get(c.gl_number) ?? 0,
  }));
  const t = d.thresholds;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2"><MonthPicker periods={d.loaded} value={period} statuses={statuses} /></div>
      {statuses[period] === 'open' && <OpenBanner period={period} />}
      {items.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          {statuses[period] === 'closed' ? `${periodLabel(period, 'long')} is closed — the checklist runs for open months.` : 'Nothing expected is missing.'}
        </p>
      ) : (
        <ChecklistClient key={period} items={items} accounts={accounts} entities={entities} period={period} />
      )}
      <p className="text-xs text-muted-foreground">
        An item appears when the account posted at that location in at least {t.checklist_min_months} of the last {t.checklist_window} closed months but is missing or $0 this month.
        Expected = the median of the months it posted. Lines that post later are ticked automatically on the next upload.
      </p>
    </div>
  );
}
