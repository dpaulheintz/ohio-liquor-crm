import Link from 'next/link';
import { Download, FileSpreadsheet, Upload } from 'lucide-react';
import { getFinData, pickPeriod, ym } from '@/lib/fin/page-data';
import { TOTAL, indexLines, primePct, totals, twelveMonths } from '@/lib/fin/compute';
import { ACCOUNTING_PATH, fmtPct, fmtUsd, periodLabel } from '@/lib/fin/shared';
import { MonthPicker } from '@/components/accounting/controls';
import { OpenBanner, Sparkline } from '@/components/accounting/bits';

export const dynamic = 'force-dynamic';

export default async function AccountingOverview({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const d = await getFinData();
  const period = pickPeriod(d, (await searchParams).m);
  const idx = indexLines(d.lines);
  const accounts = new Map(d.accounts.map((a) => [a.gl_number, a]));
  const status = d.periods.find((p) => p.period === period)?.status;
  const statuses = Object.fromEntries(d.periods.map((p) => [p.period, p.status]));
  const months = twelveMonths(period);
  const upload = d.uploads.find((u) => u.period === period && u.status === 'current');
  const flags = d.flags.filter((f) => f.period === period && f.status === 'open');
  const missing = d.checklist.filter((c) => c.period === period && c.status === 'missing');
  const q = `?m=${ym(period)}`;

  const card = (code: string, name: string) => {
    const t = totals(idx, accounts, [period], code);
    const series = months.map((m) => totals(idx, accounts, [m], code)?.profit ?? null);
    const prime = primePct(t);
    return (
      <Link key={code} href={code === TOTAL ? `${ACCOUNTING_PATH}/pnl${q}` : `${ACCOUNTING_PATH}/location${q}&e=${code}`}
        className={`block rounded-lg border bg-card p-4 transition-colors hover:bg-muted/40 ${code === TOTAL ? 'border-primary/40' : ''}`} data-location-card={code}>
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-semibold">{name}</h2>
          {flags.some((f) => f.entity_code === code && f.severity === 'high') && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">{flags.filter((f) => f.entity_code === code && f.severity === 'high').length} high</span>}
        </div>
        {t ? (
          <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
            <div><dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Net Sales</dt><dd className="font-semibold tabular-nums">{fmtUsd(t.net, { whole: true })}</dd></div>
            <div><dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Prime Cost</dt><dd className="font-semibold tabular-nums">{fmtPct(prime)}</dd></div>
            <div><dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Net Profit</dt><dd className={`font-semibold tabular-nums ${t.profit < 0 ? 'text-red-700' : ''}`}>{fmtUsd(t.profit, { whole: true })}</dd></div>
          </dl>
        ) : <p className="mt-2 text-sm text-muted-foreground">No P&amp;L for this month.</p>}
        <div className="mt-3 flex items-end justify-between gap-2 text-primary">
          <Sparkline values={series} label={`${name} net profit, ${periodLabel(months[0])} to ${periodLabel(period)}`} />
          <span className="text-[10px] text-muted-foreground">Net profit · 12 mo</span>
        </div>
      </Link>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker periods={d.loaded} value={period} statuses={statuses} />
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status === 'closed' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{status === 'closed' ? 'Closed' : 'Open'}</span>
        {upload && <span className="text-xs text-muted-foreground">Upload v{upload.version} · {upload.source === 'history' ? 'history load' : upload.file_name} · {new Date(upload.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' })}</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          <a className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted" href={`/api/accounting/package?m=${ym(period)}&format=pdf`}><Download className="h-4 w-4" />Month-End PDF</a>
          <a className="inline-flex h-9 items-center gap-1.5 rounded-md border bg-background px-3 text-sm font-medium hover:bg-muted" href={`/api/accounting/package?m=${ym(period)}&format=xlsx`}><FileSpreadsheet className="h-4 w-4" />XLSX</a>
          <Link className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90" href={`${ACCOUNTING_PATH}/upload${q}`}><Upload className="h-4 w-4" />Upload P&amp;L</Link>
        </div>
      </div>

      {status === 'open' && <OpenBanner period={period} />}

      <div className="grid gap-3 sm:grid-cols-3">
        <Link href={`${ACCOUNTING_PATH}/flags${q}`} className="rounded-lg border bg-card p-3 hover:bg-muted/40">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Open flags</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{flags.length}</div>
          <div className="text-xs text-muted-foreground">{flags.filter((f) => f.severity === 'high').length} high · {flags.filter((f) => f.severity === 'medium').length} medium · {flags.filter((f) => f.severity === 'info').length} info</div>
        </Link>
        <Link href={`${ACCOUNTING_PATH}/checklist${q}`} className="rounded-lg border bg-card p-3 hover:bg-muted/40">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Close checklist</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{status === 'open' ? missing.length : '—'}</div>
          <div className="text-xs text-muted-foreground">{status === 'open' ? 'expected entries still missing' : 'month is closed'}</div>
        </Link>
        <div className="rounded-lg border bg-card p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Months loaded</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{d.loaded.length}</div>
          <div className="text-xs text-muted-foreground">{periodLabel(d.loaded[0] ?? period)} – {periodLabel(d.loaded.at(-1) ?? period)} · {d.periods.filter((p) => p.status === 'open').length} open</div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {d.entities.filter((e) => e.active).map((e) => card(e.code, e.name))}
        {card(TOTAL, 'Company total')}
      </div>
    </div>
  );
}
