// Accounting: review flags, recalculated from the stored lines (pure — no database access here).
// Rules (thresholds editable in Settings, seeded from accounting's "Review Assumptions"):
//  • Variance: month-over-month change > 20% or year-over-year > 50%, AND over the $1,000 materiality;
//    or a charge over 2× its trailing-3-month average. One flag per account/location/month listing every
//    comparison that fired.
//  • Possible reclass: same location and month, one account drops and another rises by a similar amount
//    (within 15%), both over $5,000.
//  • Prime cost % outside the normal range (per location, or the global 55–68%).
//  • Sign flip: an account that's normally positive goes negative, or vice versa.
//  • New account (first posting at a location), renamed account, name-only export, user mapping, open month.
//  • Severity: high when the $ impact ≥ $10,000; info for the informational types.
import { change, indexLines, totals, value, type LineIndex } from './compute';
import {
  addMonths, fmtPct, fmtUsd, median, periodLabel, type FinAccount, type FinEntity, type Line, type Thresholds,
} from './shared';

export type FlagType =
  | 'variance' | 'reclass' | 'prime_cost' | 'sign_flip' | 'new_account' | 'renamed' | 'name_only_export' | 'mapped' | 'open_month';

export interface FlagRow {
  period: string;
  entity_code: string | null;
  gl_number: string | null;
  type: FlagType;
  rule_key: string;
  severity: 'high' | 'medium' | 'info';
  message: string;
  impact: number | null; // cents
}

export const FLAG_TYPE_LABEL: Record<FlagType, string> = {
  variance: 'Variance', reclass: 'Possible reclass', prime_cost: 'Prime cost %', sign_flip: 'Sign flip',
  new_account: 'New account', renamed: 'Renamed account', name_only_export: 'Export format', mapped: 'Mapped account', open_month: 'Open month',
};

export interface UploadInfo { period: string; mappings: { label: string; gl: string; via: string }[] }

export interface FlagInput {
  lines: Line[];
  accounts: FinAccount[];
  entities: FinEntity[];
  thresholds: Thresholds;
  periods: { period: string; status: 'open' | 'closed' }[];
  uploads: UploadInfo[]; // the current upload of each month
}

const usd = (c: number) => fmtUsd(c, { whole: true });
/** Revenue lines and expense lines: a reclass moves money within one kind, not between them. */
const kindOf = (section: string | undefined) => (section === 'sales' || section === 'discounts' ? 'revenue' : 'expense');
const signed = (c: number) => fmtUsd(c, { whole: true, sign: true });
const labelName = (label: string) => label.replace(/^\d{3,6}\s*-\s*/, '').trim();

export function computeFlags(input: FlagInput, onlyPeriods?: string[]): FlagRow[] {
  const t = input.thresholds;
  const idx = indexLines(input.lines);
  const accounts = new Map(input.accounts.map((a) => [a.gl_number, a]));
  const loaded = [...idx.keys()].sort();
  const first = loaded[0];
  const out: FlagRow[] = [];
  const C = (dollars: number) => Math.round(dollars * 100);
  const severityFor = (impact: number | null) => (impact !== null && Math.abs(impact) >= C(t.high_priority) ? 'high' : 'medium');
  const accName = (gl: string) => `${gl} ${accounts.get(gl)?.name ?? ''}`.trim();

  for (const period of loaded) {
    if (onlyPeriods && !onlyPeriods.includes(period)) continue;
    const prev = addMonths(period, -1), yoy = addMonths(period, -12);
    const t3 = [1, 2, 3].map((n) => addMonths(period, -n)).filter((p) => idx.has(p));
    const status = input.periods.find((p) => p.period === period)?.status ?? 'open';

    if (status === 'open') {
      out.push({ period, entity_code: null, gl_number: null, type: 'open_month', rule_key: 'open_month', severity: 'info',
        message: `${periodLabel(period, 'long')} is open — numbers are not final.`, impact: null });
    }

    // ── Export format, mappings, renames (from the upload's own row labels) ──
    const up = input.uploads.find((u) => u.period === period);
    const prevUp = input.uploads.find((u) => u.period === prev);
    if (up) {
      const byName = up.mappings.filter((m) => m.via !== 'number');
      if (byName.length && byName.length >= up.mappings.length / 2) {
        out.push({ period, entity_code: null, gl_number: null, type: 'name_only_export', rule_key: 'name_only_export', severity: 'info',
          message: `This month’s export had no account numbers — ${byName.length} rows were matched to GL accounts by name. Check the column order and account list if the export format changed.`, impact: null });
      }
      for (const m of up.mappings.filter((x) => x.via === 'user')) {
        out.push({ period, entity_code: null, gl_number: m.gl, type: 'mapped', rule_key: `mapped|${m.gl}`, severity: 'info',
          message: `“${labelName(m.label)}” wasn’t recognized and was mapped to ${accName(m.gl)} on upload.`, impact: null });
      }
      if (prevUp) {
        const prevNames = new Map<string, Set<string>>();
        for (const m of prevUp.mappings) { const s = prevNames.get(m.gl) ?? new Set(); s.add(labelName(m.label).toLowerCase()); prevNames.set(m.gl, s); }
        const seen = new Set<string>();
        for (const m of up.mappings) {
          const before = prevNames.get(m.gl);
          const now = labelName(m.label);
          if (!before || seen.has(m.gl) || before.has(now.toLowerCase())) continue;
          if ([...before].some((b) => b.replace(/[^a-z0-9]/g, '') === now.toLowerCase().replace(/[^a-z0-9]/g, ''))) continue; // punctuation only
          seen.add(m.gl);
          const was = prevUp.mappings.find((x) => x.gl === m.gl);
          out.push({ period, entity_code: null, gl_number: m.gl, type: 'renamed', rule_key: `renamed|${m.gl}`, severity: 'info',
            message: `${m.gl} now appears as “${now}” (was “${was ? labelName(was.label) : ''}” in ${periodLabel(prev)}). Same GL, so its history carries over.`, impact: null });
        }
      }
    }

    for (const e of input.entities) {
      const cur = idx.get(period)?.get(e.code) ?? new Map<string, number>();
      const prevMap = idx.get(prev)?.get(e.code);
      const gls = new Set<string>([...cur.keys(), ...(prevMap ? prevMap.keys() : [])]);

      // month-over-month deltas, for the reclass rule and the "same month" context
      const deltas: { gl: string; d: number }[] = [];
      if (idx.has(prev)) for (const gl of gls) {
        const d = (cur.get(gl) ?? 0) - (prevMap?.get(gl) ?? 0);
        if (Math.abs(d) >= C(t.reclass_min)) deltas.push({ gl, d });
      }
      // each account pairs at most once, with its closest match of the same kind (greedy by gap)
      const kind = (gl: string) => kindOf(accounts.get(gl)?.section);
      const candidates: { down: string; up: string; dDown: number; dUp: number; gap: number }[] = [];
      for (const a of deltas.filter((x) => x.d < 0)) for (const b of deltas.filter((x) => x.d > 0)) {
        if (kind(a.gl) !== kind(b.gl)) continue;
        const gap = Math.abs(a.d + b.d);
        if (gap <= t.reclass_tolerance * Math.max(Math.abs(a.d), Math.abs(b.d))) candidates.push({ down: a.gl, up: b.gl, dDown: a.d, dUp: b.d, gap });
      }
      const pairs: typeof candidates = [];
      const used = new Set<string>();
      for (const c of candidates.sort((x, y) => x.gap - y.gap)) {
        if (used.has(c.down) || used.has(c.up)) continue;
        used.add(c.down); used.add(c.up); pairs.push(c);
      }
      for (const p of pairs) {
        const impact = Math.min(Math.abs(p.dDown), p.dUp);
        out.push({ period, entity_code: e.code, gl_number: p.down, type: 'reclass', rule_key: `reclass|${e.code}|${p.down}|${p.up}`, severity: severityFor(impact),
          message: `${e.name}: ${accName(p.down)} fell ${usd(-p.dDown)} while ${accName(p.up)} rose ${usd(p.dUp)} vs ${periodLabel(prev)} — possible reclass.`, impact });
      }
      const paired = new Set(pairs.flatMap((p) => [p.down, p.up]));

      for (const gl of gls) {
        const c = cur.get(gl) ?? 0;
        // history at this location (months with an upload, before this one)
        const hist = loaded.filter((p) => p < period).map((p) => idx.get(p)?.get(e.code)?.get(gl) ?? 0);
        const everPosted = hist.some((v) => v !== 0);

        // New account at this location (skip the first loaded month — everything is "new" there).
        // A brand-new account in the chart is always flagged; a first posting at a location needs materiality.
        const brandNew = accounts.get(gl)?.created_period === period;
        if (c !== 0 && !everPosted && period !== first) {
          if (!brandNew && Math.abs(c) < C(t.materiality)) continue;
          out.push({ period, entity_code: e.code, gl_number: gl, type: 'new_account', rule_key: `new|${e.code}|${gl}`, severity: 'info',
            message: `${e.name}: ${accName(gl)} posted ${usd(c)} for the first time${brandNew ? ' — a new account in the chart of accounts this month' : ''}.`, impact: c });
          continue;
        }

        // In an open month a regular line still at $0 is a close-checklist item, not a variance.
        if (status === 'open' && c === 0) continue;

        // Variance (MoM / YoY / large charge), one flag per line
        const reasons: string[] = [];
        let impact = 0;
        const pv = idx.has(prev) ? prevMap?.get(gl) ?? 0 : null;
        if (pv !== null) {
          const d = c - pv, pct = change(c, pv);
          if (Math.abs(d) >= C(t.materiality) && (pv === 0 ? c !== 0 : Math.abs(pct!) > t.mom_pct)) {
            reasons.push(`${signed(d)} vs ${periodLabel(prev)} (${usd(pv)}${pct !== null ? `, ${pct > 0 ? '+' : ''}${fmtPct(pct, 0)}` : ''})`);
            impact = d;
          }
        }
        const yv = value(idx, yoy, e.code, gl);
        if (yv !== null) {
          const d = c - yv, pct = change(c, yv);
          if (Math.abs(d) >= C(t.materiality) && (yv === 0 ? c !== 0 : Math.abs(pct!) > t.yoy_pct)) {
            reasons.push(`${signed(d)} vs ${periodLabel(yoy)} (${usd(yv)}${pct !== null ? `, ${pct > 0 ? '+' : ''}${fmtPct(pct, 0)}` : ''})`);
            if (Math.abs(d) > Math.abs(impact)) impact = d;
          }
        }
        if (t3.length >= 2) {
          const avg = Math.round(t3.reduce((s, p) => s + Math.abs(idx.get(p)?.get(e.code)?.get(gl) ?? 0), 0) / t3.length);
          if (avg > 0 && Math.abs(c) > t.large_multiple * avg && Math.abs(c) - avg >= C(t.materiality)) {
            reasons.unshift(`${(Math.abs(c) / avg).toFixed(1)}× its ${t3.length}-month average (${usd(avg)})`);
            if (Math.abs(c) - avg > Math.abs(impact)) impact = c >= 0 ? c - avg : c + avg;
          }
        }
        if (reasons.length) {
          let msg = `${e.name}: ${accName(gl)} ${usd(c)} — ${reasons.join('; ')}.`;
          // a big move with an opposite move of similar size the same month (outside the reclass tolerance)
          const myD = deltas.find((x) => x.gl === gl);
          if (myD && !paired.has(gl)) {
            const opp = deltas.filter((x) => x.gl !== gl && Math.sign(x.d) !== Math.sign(myD.d) && kind(x.gl) === kind(gl)).sort((a, b) => Math.abs(b.d) - Math.abs(a.d))[0];
            if (opp && Math.abs(opp.d) >= 0.5 * Math.abs(myD.d) && Math.abs(opp.d) <= 2 * Math.abs(myD.d)) {
              msg += ` Same month, ${accName(opp.gl)} ${opp.d > 0 ? 'rose' : 'fell'} ${usd(Math.abs(opp.d))} — check for a reclass.`;
            }
          }
          out.push({ period, entity_code: e.code, gl_number: gl, type: 'variance', rule_key: `var|${e.code}|${gl}`, severity: severityFor(impact), message: msg, impact });
        }

        // Sign flip vs the last up-to-9 months with activity
        const recent = hist.slice(-9).filter((v) => v !== 0);
        if (c !== 0 && Math.abs(c) >= C(t.materiality) && recent.length >= 3) {
          const pos = recent.filter((v) => v > 0).length, neg = recent.length - pos;
          const usual = pos >= 0.8 * recent.length ? 1 : neg >= 0.8 * recent.length ? -1 : 0;
          if (usual !== 0 && Math.sign(c) !== usual) {
            const typical = median(recent);
            out.push({ period, entity_code: e.code, gl_number: gl, type: 'sign_flip', rule_key: `sign|${e.code}|${gl}`, severity: severityFor(c - typical),
              message: `${e.name}: ${accName(gl)} is ${usd(c)}; it’s normally ${usual > 0 ? 'positive' : 'negative'} (typical ${usd(typical)}).`, impact: c - typical });
          }
        }
      }

      // Payroll KPI (6000 + 7102), as in accounting's methodology
      const payroll = (p: string) => { const m = idx.get(p)?.get(e.code); return m ? (m.get('6000') ?? 0) + (m.get('7102') ?? 0) : null; };
      const pc = payroll(period), pp = payroll(prev);
      // only where DSP Sales Team Payroll is material; otherwise it's just 6000, already flagged on its own
      const hasSalesTeam = Math.max(Math.abs(cur.get('7102') ?? 0), Math.abs(prevMap?.get('7102') ?? 0)) >= C(t.materiality);
      if (hasSalesTeam && pc !== null && pp !== null && pp !== 0) {
        const d = pc - pp, pct = change(pc, pp)!;
        if (Math.abs(d) >= C(t.materiality) && Math.abs(pct) > t.mom_pct) {
          out.push({ period, entity_code: e.code, gl_number: null, type: 'variance', rule_key: `payroll|${e.code}`, severity: severityFor(d),
            message: `${e.name}: Payroll (6000 + 7102) ${usd(pc)} vs ${usd(pp)} in ${periodLabel(prev)} (${signed(d)}, ${pct > 0 ? '+' : ''}${fmtPct(pct, 0)}).`, impact: d });
        }
      }

      // Prime cost %
      if (e.prime_cost_check) {
        const tot = totals(idx, accounts, [period], e.code);
        if (tot && tot.net > 0) {
          const lo = e.prime_min ?? t.prime_min, hi = e.prime_max ?? t.prime_max;
          const pct = tot.prime / tot.net;
          if (pct < lo || pct > hi) {
            const bound = pct < lo ? lo : hi;
            const impact = tot.prime - Math.round(bound * tot.net);
            out.push({ period, entity_code: e.code, gl_number: null, type: 'prime_cost', rule_key: `prime|${e.code}`, severity: severityFor(impact),
              message: `${e.name}: prime cost is ${fmtPct(pct)} of net sales (${usd(tot.prime)} on ${usd(tot.net)}); normal range ${fmtPct(lo, 0)}–${fmtPct(hi, 0)}.`, impact });
          }
        }
      }
    }
  }
  return out;
}

// ─── Close checklist ──────────────────────────────────────────────────────────

export interface ChecklistRow { entity_code: string; gl_number: string; expected: number; months_posted: number; window_months: number; posted: boolean; current: number }

/** Accounts that posted in ≥ 7 of the last 9 closed months for a location but are missing or $0 now. */
export function computeChecklist(idx: LineIndex, period: string, closedPeriods: string[], entities: FinEntity[], t: Thresholds, existing: Set<string> = new Set()): ChecklistRow[] {
  const window = closedPeriods.filter((p) => p < period && idx.has(p)).sort().slice(-t.checklist_window);
  const out: ChecklistRow[] = [];
  for (const e of entities) {
    const gls = new Set<string>();
    for (const p of window) for (const gl of idx.get(p)?.get(e.code)?.keys() ?? []) gls.add(gl);
    for (const gl of gls) {
      const vals = window.map((p) => idx.get(p)?.get(e.code)?.get(gl) ?? 0).filter((v) => v !== 0);
      if (vals.length < t.checklist_min_months) continue;
      const current = idx.get(period)?.get(e.code)?.get(gl) ?? 0;
      const posted = current !== 0;
      if (posted && !existing.has(`${e.code}|${gl}`)) continue; // only track what was missing at some point
      out.push({ entity_code: e.code, gl_number: gl, expected: median(vals), months_posted: vals.length, window_months: window.length, posted, current });
    }
  }
  return out;
}

export const indexFor = indexLines;
export type { LineIndex };
