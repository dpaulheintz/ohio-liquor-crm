import { getFinData } from '@/lib/fin/page-data';
import { requireAccounting } from '@/lib/fin/server';
import { indexLines, value } from '@/lib/fin/compute';
import { DEFAULT_CROSS_CHECKS, fmtPct, fmtUsd, periodLabel, toCents, type CrossCheckSettings } from '@/lib/fin/shared';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const daysIn = (p: string) => new Date(Date.UTC(Number(p.slice(0, 4)), Number(p.slice(5, 7)), 0)).getUTCDate();

// Informational only: never blocks an upload or a close.
export default async function CrossChecksPage() {
  const d = await getFinData();
  const { supabase } = await requireAccounting();
  const { data: s } = await supabase.from('fin_settings').select('value').eq('key', 'cross_checks').maybeSingle();
  const cfg: CrossCheckSettings = { ...DEFAULT_CROSS_CHECKS, ...((s?.value as Partial<CrossCheckSettings>) ?? {}) };
  const tol = cfg.tolerance ?? 0.02;
  const months = [...d.loaded].reverse();
  const idx = indexLines(d.lines);
  const { data: src, error } = await supabase.rpc('fin_cross_check_sources', { p_from: d.loaded[0] ?? '2025-01-01', p_to: d.loaded.at(-1) ?? '2025-01-01' });
  const toast = new Map<string, { fnb: number; days: number }>();
  const bottles = new Map<string, { paid: number; entries: number }>();
  for (const t of (src?.toast ?? []) as { location_id: string; period: string; fnb: string; days: number }[]) toast.set(`${t.location_id}|${t.period}`, { fnb: toCents(t.fnb), days: t.days });
  for (const b of (src?.bottles ?? []) as { period: string; paid: string; entries: number }[]) bottles.set(b.period, { paid: toCents(b.paid), entries: b.entries });
  const toastEntities = d.entities.filter((e) => e.active && e.toast_location_id);
  const dsp = d.entities.find((e) => e.code === cfg.dsp_entity);

  const verdict = (pnl: number | null, other: number | null) => {
    if (pnl === null || other === null) return { cls: 'text-muted-foreground', label: '—' };
    const pct = pnl ? (other - pnl) / Math.abs(pnl) : null;
    return pct !== null && Math.abs(pct) <= tol ? { cls: 'text-emerald-700', label: 'match' } : { cls: 'text-amber-700', label: 'review' };
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Informational — these comparisons never block an upload or a close. A gap usually means timing (P&amp;L posts by accounting date) or missing Toast days.</p>
      {error && <p className="text-sm text-red-700">Could not load Toast / Bottle Sales: {error.message}</p>}

      <section className="space-y-2">
        <h2 className="font-semibold">P&amp;L food + beverage sales ({cfg.sales_gls.join(' + ')}) vs Toast F&amp;B revenue</h2>
        <div className="overflow-x-auto rounded-lg border bg-card" data-cross-toast>
          <table className="w-full min-w-[820px] text-sm tabular-nums">
            <thead>
              <tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left">Month</th><th className="px-3 py-2 text-left">Location</th>
                <th className="px-3 py-2 text-right">P&amp;L</th><th className="px-3 py-2 text-right">Toast</th>
                <th className="px-3 py-2 text-right">Difference</th><th className="px-3 py-2 text-right">%</th>
                <th className="px-3 py-2 text-right">Toast days</th><th className="px-3 py-2 text-left">Result</th>
              </tr>
            </thead>
            <tbody>
              {months.flatMap((m) => toastEntities.map((e, i) => {
                const pnl = cfg.sales_gls.reduce<number | null>((acc, gl) => { const v = value(idx, m, e.code, gl); return v === null ? acc : (acc ?? 0) + v; }, null);
                const t = toast.get(`${e.toast_location_id}|${m}`) ?? null;
                const diff = pnl !== null && t ? t.fnb - pnl : null;
                const v = verdict(pnl, t?.fnb ?? null);
                const partial = t && t.days < daysIn(m) - (e.code === 'PO' ? 12 : 1);
                return (
                  <tr key={`${m}-${e.code}`} className={cn('border-t border-muted/60', i === 0 && 'border-t-foreground/20')}>
                    <td className="px-3 py-1.5">{i === 0 ? periodLabel(m) : ''}</td>
                    <td className="px-3 py-1.5">{e.name}</td>
                    <td className="px-3 py-1.5 text-right">{pnl === null ? '' : fmtUsd(pnl)}</td>
                    <td className="px-3 py-1.5 text-right">{t ? fmtUsd(t.fnb) : <span className="text-muted-foreground">no Toast data</span>}</td>
                    <td className="px-3 py-1.5 text-right">{diff === null ? '' : fmtUsd(diff, { sign: true })}</td>
                    <td className="px-3 py-1.5 text-right">{diff === null || !pnl ? '' : fmtPct(diff / Math.abs(pnl))}</td>
                    <td className={cn('px-3 py-1.5 text-right', partial && 'font-semibold text-amber-700')}>{t ? `${t.days} / ${daysIn(m)}` : ''}</td>
                    <td className={cn('px-3 py-1.5 text-xs font-semibold', v.cls)}>{v.label}{partial ? ' · Toast incomplete' : ''}</td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
      </section>

      {dsp && (
        <section className="space-y-2">
          <h2 className="font-semibold">{dsp.name} {cfg.dsp_gl} vs Bottle Sales “paid to us”</h2>
          <div className="overflow-x-auto rounded-lg border bg-card" data-cross-bottles>
            <table className="w-full min-w-[640px] text-sm tabular-nums">
              <thead>
                <tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 text-left">Month</th><th className="px-3 py-2 text-right">P&amp;L {cfg.dsp_gl}</th>
                  <th className="px-3 py-2 text-right">Bottle Sales paid</th><th className="px-3 py-2 text-right">Entries</th>
                  <th className="px-3 py-2 text-right">Difference</th><th className="px-3 py-2 text-left">Result</th>
                </tr>
              </thead>
              <tbody>
                {months.map((m) => {
                  const pnl = idx.has(m) ? value(idx, m, dsp.code, cfg.dsp_gl) : null;
                  const b = bottles.get(m) ?? null;
                  const v = verdict(pnl, b?.paid ?? null);
                  return (
                    <tr key={m} className="border-t border-muted/60">
                      <td className="px-3 py-1.5">{periodLabel(m)}</td>
                      <td className="px-3 py-1.5 text-right">{pnl === null ? '' : fmtUsd(pnl)}</td>
                      <td className="px-3 py-1.5 text-right">{b ? fmtUsd(b.paid) : <span className="text-muted-foreground">none entered</span>}</td>
                      <td className="px-3 py-1.5 text-right">{b?.entries ?? ''}</td>
                      <td className="px-3 py-1.5 text-right">{pnl !== null && b ? fmtUsd(b.paid - pnl, { sign: true }) : ''}</td>
                      <td className={cn('px-3 py-1.5 text-xs font-semibold', v.cls)}>{v.label}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">Bottle Sales covers the bottles High Bank’s agencies record; {cfg.dsp_gl} is everything the plant books, so a standing gap is expected. Watch for changes in the gap, not the gap itself. Change the account mapping in Settings.</p>
        </section>
      )}
      <p className="text-xs text-muted-foreground">“Match” = within {fmtPct(tol, 0)}. “Toast incomplete” = Toast has fewer business days than the month (sync gap).</p>
    </div>
  );
}
