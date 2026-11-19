import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Download } from 'lucide-react';
import { getFinData, pickPeriod, ym } from '@/lib/fin/page-data';
import { requireAccounting } from '@/lib/fin/server';
import { TOTAL, indexLines, twelveMonths, value } from '@/lib/fin/compute';
import { ACCOUNTING_PATH, SECTION_LABEL, fmtMoney, monthShort, periodLabel } from '@/lib/fin/shared';
import { MonthPicker } from '@/components/accounting/controls';
import { Sparkline } from '@/components/accounting/bits';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

// One account: its trend by month at every location, and the upload each month's figure came from.
export default async function AccountPage({ params, searchParams }: { params: Promise<{ gl: string }>; searchParams: Promise<{ m?: string }> }) {
  const { gl } = await params;
  const sp = await searchParams;
  const d = await getFinData();
  const account = d.accounts.find((a) => a.gl_number === gl);
  if (!account) notFound();
  const period = pickPeriod(d, sp.m);
  const idx = indexLines(d.lines);
  const months = twelveMonths(period);
  const entities = d.entities.filter((e) => e.active);
  const statuses = Object.fromEntries(d.periods.map((p) => [p.period, p.status]));
  const aliases = d.aliases.filter((a) => a.gl_number === gl);

  // Which upload each stored figure came from
  const { supabase } = await requireAccounting();
  const { data: src } = await supabase.from('fin_lines').select('period, entity_code, upload_id').eq('gl_number', gl).in('period', months);
  const uploadById = new Map(d.uploads.map((u) => [u.id, u]));
  const sourceOf = (m: string) => {
    const ids = [...new Set((src ?? []).filter((r) => r.period === m).map((r) => r.upload_id))];
    return ids.map((id) => uploadById.get(id)).filter(Boolean);
  };
  const flags = d.flags.filter((f) => f.gl_number === gl && months.includes(f.period));
  const rows = [...entities.map((e) => ({ code: e.code, name: e.name })), { code: TOTAL, name: 'Total' }];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <MonthPicker periods={d.loaded} value={period} statuses={statuses} />
        <Link href={`${ACCOUNTING_PATH}/pnl?m=${ym(period)}`} className="text-sm text-muted-foreground hover:underline">← P&amp;L</Link>
      </div>
      <div>
        <h2 className="text-lg font-semibold">{account.gl_number} – {account.name}</h2>
        <p className="text-sm text-muted-foreground">
          {SECTION_LABEL[account.section]}{!account.active && ' · inactive'}{account.created_period && ` · first seen ${periodLabel(account.created_period)}`}
          {aliases.length > 0 && <> · also read as: {aliases.map((a) => a.alias).join(', ')}</>}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card" data-account-table>
        <table className="w-full min-w-[1100px] text-sm tabular-nums">
          <thead>
            <tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left">Location</th>
              {months.map((m) => <th key={m} className={cn('px-2 py-2 text-right', m === period && 'bg-amber-50')}>{monthShort(m)} {m.slice(2, 4)}{statuses[m] === 'open' ? '*' : ''}</th>)}
              <th className="px-3 py-2 text-left">Trend</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const vals = months.map((m) => value(idx, m, r.code, gl));
              return (
                <tr key={r.code} className={cn('border-t border-muted/60', r.code === TOTAL && 'bg-muted/30 font-semibold')}>
                  <td className="sticky left-0 z-10 bg-inherit px-3 py-1.5">
                    {r.code === TOTAL ? r.name : <Link className="hover:underline" href={`${ACCOUNTING_PATH}/location?m=${ym(period)}&e=${r.code}`}>{r.name}</Link>}
                  </td>
                  {vals.map((v, i) => <td key={months[i]} className={cn('px-2 py-1.5 text-right', months[i] === period && 'bg-amber-50', (v ?? 0) < 0 && 'text-red-700')}>{fmtMoney(v)}</td>)}
                  <td className="px-3 py-1.5 text-primary"><Sparkline values={vals} width={110} height={26} label={`${r.name} ${account.name} trend`} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {flags.length > 0 && (
        <section className="rounded-lg border bg-card p-3">
          <h3 className="mb-2 text-sm font-semibold">Flags on this account</h3>
          <ul className="space-y-1 text-sm">
            {flags.map((f) => (
              <li key={f.id}><span className="text-muted-foreground">{periodLabel(f.period)} · {f.entity_code ?? 'All'} ·</span> {f.message} <span className="text-xs text-muted-foreground">({f.status})</span></li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-lg border bg-card">
        <h3 className="border-b px-3 py-2 text-sm font-semibold">Where each month came from</h3>
        <ul className="divide-y text-sm">
          {[...months].reverse().filter((m) => idx.has(m)).map((m) => (
            <li key={m} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
              <span className="w-20 font-medium">{periodLabel(m)}</span>
              {sourceOf(m).length === 0 && <span className="text-muted-foreground">not posted this month</span>}
              {sourceOf(m).map((u) => (
                <span key={u!.id} className="inline-flex flex-wrap items-center gap-2">
                  <span>v{u!.version} · {u!.source === 'history' ? 'history load' : u!.file_name}{u!.sheet_name ? ` › ${u!.sheet_name}` : ''}</span>
                  <span className="text-xs text-muted-foreground">{u!.uploaded_by_name ?? ''} · {new Date(u!.uploaded_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' })}</span>
                  {u!.file_path && <a className="inline-flex items-center gap-1 text-xs text-primary hover:underline" href={`/api/accounting/uploads/${u!.id}`}><Download className="h-3 w-3" />file</a>}
                </span>
              ))}
            </li>
          ))}
        </ul>
      </section>
      <p className="text-xs text-muted-foreground">* open month. Blank = no upload for that month; – = no posting.</p>
    </div>
  );
}
