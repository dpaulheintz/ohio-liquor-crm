// Payroll rules engine: Toast source rows → pay lines → blockers/warnings. Pure functions, integer math.
import { sumRows } from './detect';
import { addDays, centsDisplay, divRound, hoursPlain, hoursTimesRate, overtimePay, tippedOvertimePay, weekStart, ymdToUtc } from './units';
import type {
  Flag, FileKind, JobMapping, LocationSummary, PayLine, Paycode, PayrollEmployee, PayrollLocation,
  PayrollSettings, SourceRow, Totals,
} from './types';

export interface EngineFile {
  id: string;
  name: string;
  kind: FileKind;
  locationId: string | null;
  duplicateOf: string | null;
  control: Totals | null;
  rows: SourceRow[];
}

export interface EngineContext {
  periodStart: string;
  periodEnd: string;
  settings: PayrollSettings;
  locations: PayrollLocation[];
  employees: PayrollEmployee[];
  jobs: JobMapping[];
  paycodes: Paycode[];
  /** Gross per employee key from the most recent earlier run, for new/missing/big-change warnings. */
  previous: Record<string, { name: string; grossCents: number }> | null;
}

export const TIP_TYPES = ['CCTIPS', 'CASHTIPS'];
const HOURS_TYPES = ['REG', 'OT'];

export const nameKey = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');

export function matchEmployee(toastName: string, toastId: string | null, employees: PayrollEmployee[]): PayrollEmployee | null {
  if (toastId) {
    const byId = employees.find((e) => e.toast_employee_id && e.toast_employee_id === toastId);
    if (byId) return byId;
  }
  const key = nameKey(toastName);
  return employees.find((e) => nameKey(e.toast_name) === key) ?? null;
}

export function employeeKey(employeeId: string | null, toastName: string): string {
  return employeeId ? `emp:${employeeId}` : `name:${nameKey(toastName)}`;
}

export function findJob(jobs: JobMapping[], locationId: string | null, title: string | null): JobMapping | null {
  const t = (title ?? '').trim().toLowerCase();
  return jobs.find((j) => j.location_id === locationId && j.toast_job_title.trim().toLowerCase() === t)
    ?? jobs.find((j) => j.location_id === null && j.toast_job_title.trim().toLowerCase() === t)
    ?? null;
}

const lineKey = (l: Pick<PayLine, 'employeeId' | 'toastName' | 'locationId' | 'jobTitle' | 'earningType' | 'rateCents'>) =>
  [employeeKey(l.employeeId, l.toastName), l.locationId ?? '', (l.jobTitle ?? '').toLowerCase(), l.earningType, l.rateCents ?? ''].join('|');
export { lineKey };

// ─── Build lines from payroll exports ─────────────────────────────────────────

export function buildLines(files: EngineFile[], ctx: EngineContext): PayLine[] {
  const map = new Map<string, PayLine>();
  const add = (l: PayLine) => {
    if (l.hoursHh === 0 && l.amountCents === 0) return;
    const k = lineKey(l);
    const prev = map.get(k);
    if (prev) {
      prev.hoursHh += l.hoursHh;
      prev.amountCents += l.amountCents;
    } else {
      map.set(k, { ...l });
    }
  };

  for (const f of files) {
    if (f.kind !== 'payroll_export' || f.duplicateOf) continue;
    for (const r of f.rows) {
      const emp = matchEmployee(r.toastName, r.toastEmployeeId, ctx.employees);
      const base = {
        employeeId: emp?.id ?? null,
        toastName: emp?.toast_name ?? r.toastName,
        toastEmployeeId: r.toastEmployeeId,
        locationId: f.locationId,
        jobTitle: r.jobTitle,
        source: 'toast' as const,
      };
      const rate = r.rateCents;
      const tipped = !!findJob(ctx.jobs, f.locationId, r.jobTitle)?.is_tipped;
      const otPay = (rc: number) => (tipped ? tippedOvertimePay(r.otHh, rc, ctx.settings.min_wage_cents) : overtimePay(r.otHh, rc));
      add({ ...base, earningType: 'REG', hoursHh: r.regHh, rateCents: rate,
        amountCents: r.regPayCents ?? (rate != null ? hoursTimesRate(r.regHh, rate) : 0) });
      add({ ...base, earningType: 'OT', hoursHh: r.otHh, rateCents: rate,
        amountCents: r.otPayCents ?? (rate != null ? otPay(rate) : 0) });
      add({ ...base, earningType: 'CCTIPS', hoursHh: 0, rateCents: null, amountCents: r.cctipsCents });
      add({ ...base, earningType: 'CASHTIPS', hoursHh: 0, rateCents: null, amountCents: r.cashtipsCents });
      add({ ...base, earningType: 'GRAT', hoursHh: 0, rateCents: null, amountCents: r.gratCents });
    }
  }
  return [...map.values()];
}

// ─── Checks ───────────────────────────────────────────────────────────────────

interface WeekAgg { hh: number; otHh: number; locations: Set<string>; tipsCents: number; tippedHh: number; tippedOtHh: number; tippedWagesCents: number }

const fmtH = (hh: number) => `${hoursPlain(hh)} hrs`;

export function checkRun(lines: PayLine[], files: EngineFile[], ctx: EngineContext): { flags: Flag[]; summaries: LocationSummary[] } {
  const flags: Flag[] = [];
  const flag = (f: Flag) => { if (!flags.some((x) => x.key === f.key)) flags.push(f); };
  const s = ctx.settings;
  const locName = (id: string | null) => ctx.locations.find((l) => l.id === id)?.name ?? 'Unknown location';
  const paycodes = new Map(ctx.paycodes.map((p) => [p.earning_type, p]));

  // ── Files ──
  const payrollLocs = new Set(files.filter((f) => f.kind === 'payroll_export' && !f.duplicateOf).map((f) => f.locationId));
  for (const f of files) {
    if (f.duplicateOf) {
      flag({ key: `duplicate_file:${f.id}`, type: 'duplicate_file', severity: 'blocker',
        message: `“${f.name}” was already uploaded (${f.duplicateOf}). Remove the duplicate.` });
      continue;
    }
    if (!f.locationId) {
      flag({ key: `file_location:${f.id}`, type: 'unmapped_location', severity: 'blocker',
        message: `Choose the location for “${f.name}”.` });
    }
    if (f.kind === 'time_entries' && f.locationId && !payrollLocs.has(f.locationId)) {
      flag({ key: `no_payroll_export:${f.locationId}`, type: 'missing_file', severity: 'blocker', locationId: f.locationId,
        message: `${locName(f.locationId)} has Time Entries but no Payroll Export file.` });
    }
    const negatives = f.rows.filter((r) => [r.regHh, r.otHh, r.rateCents ?? 0, r.regPayCents ?? 0, r.otPayCents ?? 0, r.cctipsCents, r.cashtipsCents, r.gratCents].some((v) => v < 0));
    for (const r of negatives) {
      flag({ key: `negative:${f.id}:${r.rowNumber}`, type: 'negative_value', severity: 'blocker', toastName: r.toastName, locationId: f.locationId,
        message: `Negative value in “${f.name}” row ${r.rowNumber} (${r.toastName}). Fix it in Toast or adjust the line with a reason.` });
    }
    const invalid = f.rows.filter((r) => r.issues.some((i) => i.startsWith('invalid_')));
    for (const r of invalid) {
      flag({ key: `invalid:${f.id}:${r.rowNumber}`, type: 'unreadable_value', severity: 'blocker', toastName: r.toastName,
        message: `Unreadable value in “${f.name}” row ${r.rowNumber} (${r.issues.filter((i) => i.startsWith('invalid_')).join(', ')}).` });
    }
    const rounded = f.rows.filter((r) => r.issues.some((i) => i.startsWith('rounded_')));
    if (rounded.length) {
      flag({ key: `precision:${f.id}`, type: 'precision', severity: 'warning',
        message: `${rounded.length} value(s) in “${f.name}” had more than 2 decimals and were rounded half-up.`,
        details: { rows: rounded.slice(0, 20).map((r) => r.rowNumber) } });
    }
    if (f.kind === 'payroll_export') {
      if (!f.control) {
        flag({ key: `no_control:${f.id}`, type: 'no_control_totals', severity: 'warning',
          message: `“${f.name}” has no totals row, so its lines couldn't be cross-checked against Toast's own totals.` });
      } else {
        const sum = sumRows(f.rows);
        const metrics: [keyof Totals, string, (v: number) => string][] = [
          ['regHh', 'Regular hours', fmtH], ['otHh', 'Overtime hours', fmtH],
          ['regPayCents', 'Regular pay', centsDisplay], ['otPayCents', 'Overtime pay', centsDisplay],
          ['cctipsCents', 'Non-cash tips', centsDisplay], ['cashtipsCents', 'Declared cash tips', centsDisplay],
          ['gratCents', 'Gratuity', centsDisplay],
        ];
        for (const [m, label, fmt] of metrics) {
          if (sum[m] !== f.control[m]) {
            flag({ key: `control:${f.id}:${m}`, type: 'control_mismatch', severity: 'blocker', locationId: f.locationId,
              message: `${label} in “${f.name}” add up to ${fmt(sum[m])}, but the file's total row says ${fmt(f.control[m])}.`,
              details: { parsed: sum[m], control: f.control[m] } });
          }
        }
      }
    }
  }

  // ── Locations used ──
  for (const locId of new Set(lines.map((l) => l.locationId).filter(Boolean) as string[])) {
    const loc = ctx.locations.find((l) => l.id === locId);
    if (!loc?.paycom_location_code?.trim()) {
      flag({ key: `location_code:${locId}`, type: 'unmapped_location', severity: 'blocker', locationId: locId,
        message: `${locName(locId)} has no Paycom location code yet (Setup → Locations).` });
    }
  }

  // ── Per-line mapping ──
  for (const l of lines) {
    const ek = employeeKey(l.employeeId, l.toastName);
    const emp = l.employeeId ? ctx.employees.find((e) => e.id === l.employeeId) : null;
    if (!emp) {
      flag({ key: `unmapped_employee:${ek}`, type: 'unmapped_employee', severity: 'blocker', toastName: l.toastName, locationId: l.locationId,
        message: `${l.toastName} isn't mapped to a Paycom employee (Setup → Employees).` });
    } else if (!emp.paycom_employee_code?.trim()) {
      flag({ key: `unmapped_employee:${ek}`, type: 'unmapped_employee', severity: 'blocker', toastName: l.toastName,
        message: `${l.toastName} has no Paycom employee code yet.` });
    } else if (!emp.active) {
      flag({ key: `inactive_employee:${ek}`, type: 'inactive_employee', severity: 'warning', toastName: l.toastName,
        message: `${l.toastName} is marked inactive but has pay this period.` });
    }

    const pc = paycodes.get(l.earningType);
    if (!pc?.paycom_earning_code?.trim()) {
      flag({ key: `unmapped_paycode:${l.earningType}`, type: 'unmapped_paycode', severity: 'blocker',
        message: `Earning type ${l.earningType} has no Paycom earning code (Setup → Pay Codes).` });
    }

    if (l.source === 'toast' || l.jobTitle) {
      const job = findJob(ctx.jobs, l.locationId, l.jobTitle);
      const loc = ctx.locations.find((x) => x.id === l.locationId);
      if (!job || !(job.paycom_department_code?.trim() || loc?.paycom_department_code?.trim())) {
        flag({ key: `unmapped_job:${l.locationId ?? ''}:${(l.jobTitle ?? '').toLowerCase()}`, type: 'unmapped_job', severity: 'blocker', locationId: l.locationId,
          message: `Job “${l.jobTitle ?? '(blank)'}” at ${locName(l.locationId)} isn't mapped to a Paycom department (Setup → Jobs).` });
      }
    }

    if (HOURS_TYPES.includes(l.earningType) && l.hoursHh > 0 && !l.rateCents) {
      flag({ key: `missing_rate:${ek}:${l.locationId}:${(l.jobTitle ?? '').toLowerCase()}`, type: 'missing_rate', severity: 'blocker', toastName: l.toastName, locationId: l.locationId,
        message: `${l.toastName} has ${fmtH(l.hoursHh)} as ${l.jobTitle ?? 'unknown job'} at ${locName(l.locationId)} with no hourly rate.` });
    }
    if (l.hoursHh < 0 || l.amountCents < 0) {
      if (l.source === 'toast') {
        flag({ key: `negative_line:${lineKey(l)}`, type: 'negative_value', severity: 'blocker', toastName: l.toastName,
          message: `${l.toastName} has a negative ${l.earningType} line.` });
      }
    }
  }

  // ── Per employee ──
  const byEmp = new Map<string, PayLine[]>();
  for (const l of lines) {
    const k = employeeKey(l.employeeId, l.toastName);
    byEmp.set(k, [...(byEmp.get(k) ?? []), l]);
  }

  // Weekly data from Time Entries (if provided).
  const weeks = new Map<string, Map<string, WeekAgg>>();
  const haveTimeEntries = new Set<string>();
  for (const f of files) {
    if (f.kind !== 'time_entries' || f.duplicateOf) continue;
    for (const r of f.rows) {
      if (!r.workDate) continue;
      const emp = matchEmployee(r.toastName, r.toastEmployeeId, ctx.employees);
      const k = employeeKey(emp?.id ?? null, emp?.toast_name ?? r.toastName);
      haveTimeEntries.add(k);
      const wk = weekStart(r.workDate, s.workweek_start_dow);
      const empWeeks = weeks.get(k) ?? new Map<string, WeekAgg>();
      const w = empWeeks.get(wk) ?? { hh: 0, otHh: 0, locations: new Set<string>(), tipsCents: 0, tippedHh: 0, tippedOtHh: 0, tippedWagesCents: 0 };
      const hh = r.regHh + r.otHh;
      w.hh += hh;
      w.otHh += r.otHh;
      if (f.locationId) w.locations.add(f.locationId);
      const job = findJob(ctx.jobs, f.locationId, r.jobTitle);
      if (job?.is_tipped) {
        w.tippedHh += hh;
        w.tippedOtHh += r.otHh;
        w.tipsCents += r.cctipsCents + r.cashtipsCents;
        const rate = r.rateCents ?? lines.find((l) => employeeKey(l.employeeId, l.toastName) === k && l.locationId === f.locationId && l.earningType === 'REG' && (l.jobTitle ?? '').toLowerCase() === (r.jobTitle ?? '').toLowerCase())?.rateCents ?? 0;
        w.tippedWagesCents += hoursTimesRate(r.regHh, rate) + tippedOvertimePay(r.otHh, rate, s.min_wage_cents);
      }
      empWeeks.set(wk, w);
      weeks.set(k, empWeeks);
    }
  }

  const periodDays = Math.round((ymdToUtc(ctx.periodEnd) - ymdToUtc(ctx.periodStart)) / 86_400_000) + 1;
  const periodWeeks = Math.max(1, Math.ceil(periodDays / 7));

  for (const [k, empLines] of byEmp) {
    const name = empLines[0].toastName;
    const sum = (types: string[]) => empLines.filter((l) => types.includes(l.earningType));
    const regHh = sum(['REG']).reduce((a, l) => a + l.hoursHh, 0);
    const otHh = sum(['OT']).reduce((a, l) => a + l.hoursHh, 0);
    const hh = regHh + otHh;
    const locs = new Set(sum(HOURS_TYPES).filter((l) => l.hoursHh > 0).map((l) => l.locationId));
    const grossCents = empLines.reduce((a, l) => a + l.amountCents, 0);
    const empWeeks = weeks.get(k);

    // Cross-location overtime: hours combine per workweek across locations.
    if (locs.size >= 2) {
      if (empWeeks && haveTimeEntries.has(k)) {
        let expectedOt = 0;
        let toastOt = 0;
        const detail: string[] = [];
        for (const [wk, w] of [...empWeeks].sort()) {
          const due = Math.max(0, w.hh - s.ot_threshold_hh);
          expectedOt += due;
          toastOt += w.otHh;
          if (due > w.otHh) detail.push(`week of ${wk}: ${fmtH(w.hh)} combined, ${fmtH(w.otHh)} OT paid, ${fmtH(due)} due`);
        }
        const manualOt = empLines.filter((l) => l.earningType === 'OT' && l.source === 'manual_adjustment').reduce((a, l) => a + l.hoursHh, 0);
        if (expectedOt > toastOt + manualOt) {
          flag({ key: `cross_ot:${k}`, type: 'cross_location_ot', severity: 'blocker', toastName: name,
            message: `${name} worked at ${locs.size} locations and is owed ${fmtH(expectedOt - toastOt - manualOt)} more overtime (${detail.join('; ')}). Move those hours from REG to OT with an adjustment.`,
            details: { expectedOtHh: expectedOt, paidOtHh: toastOt + manualOt } });
        }
      } else {
        const due = Math.max(0, hh - s.ot_threshold_hh * periodWeeks);
        if (due > otHh) {
          flag({ key: `cross_ot:${k}`, type: 'cross_location_ot', severity: 'blocker', toastName: name,
            message: `${name} worked ${fmtH(hh)} across ${locs.size} locations but only ${fmtH(otHh)} OT was paid — at least ${fmtH(due - otHh)} more OT is owed even if hours were evenly split. Upload Time Entries for the exact weekly amount.`,
            details: { expectedOtHh: due, paidOtHh: otHh } });
        } else if (hh > s.ot_threshold_hh) {
          flag({ key: `cross_ot_unverified:${k}`, type: 'cross_location_ot', severity: 'warning', toastName: name,
            message: `${name} worked ${fmtH(hh)} across ${locs.size} locations. Without Time Entries the weekly overtime split can't be verified — confirm no single workweek exceeded ${fmtH(s.ot_threshold_hh)}.` });
        }
      }
    }

    // OT added by adjustment should come out of REG, not be paid on top of it.
    const manualHh = (t: string) => empLines.filter((l) => l.source === 'manual_adjustment' && l.earningType === t).reduce((a, l) => a + l.hoursHh, 0);
    const addedOt = manualHh('OT');
    if (addedOt > 0 && manualHh('REG') !== -addedOt) {
      flag({ key: `ot_not_moved:${k}`, type: 'ot_not_moved', severity: 'warning', toastName: name,
        message: `${name} has ${fmtH(addedOt)} of OT added by adjustment but ${fmtH(-manualHh('REG'))} removed from REG, so total hours no longer match Toast. Add a matching negative REG adjustment unless these are genuinely extra hours.` });
    }

    // Blended-rate overtime.
    const regRates = new Set(sum(['REG']).filter((l) => l.hoursHh > 0).map((l) => l.rateCents));
    if (otHh > 0 && regRates.size >= 2) {
      flag({ key: `blended_ot:${k}`, type: 'blended_rate_ot', severity: 'warning', toastName: name,
        message: `${name} has overtime and ${regRates.size} different rates (${[...regRates].map((r) => centsDisplay(r ?? 0)).join(', ')}). Confirm the blended-rate OT is handled (by us or by Paycom).` });
    }

    // Long hours.
    if (empWeeks) {
      for (const [wk, w] of empWeeks) {
        if (w.hh > s.alert_weekly_hours_hh) {
          flag({ key: `long_hours:${k}:${wk}`, type: 'long_hours', severity: 'warning', toastName: name,
            message: `${name} worked ${fmtH(w.hh)} in the week of ${wk} (alert above ${fmtH(s.alert_weekly_hours_hh)}).` });
        }
      }
    } else if (hh > s.alert_weekly_hours_hh * periodWeeks) {
      flag({ key: `long_hours:${k}`, type: 'long_hours', severity: 'warning', toastName: name,
        message: `${name} worked ${fmtH(hh)} this period (alert above ${fmtH(s.alert_weekly_hours_hh)}/week).` });
    }

    // Tips with zero hours (per location + job) and unusually high tips.
    const tipGroups = new Map<string, { tips: number; hh: number; loc: string | null; job: string | null }>();
    for (const l of empLines) {
      const g = `${l.locationId}|${(l.jobTitle ?? '').toLowerCase()}`;
      const cur = tipGroups.get(g) ?? { tips: 0, hh: 0, loc: l.locationId, job: l.jobTitle };
      if (TIP_TYPES.includes(l.earningType) || l.earningType === 'GRAT') cur.tips += l.amountCents;
      if (HOURS_TYPES.includes(l.earningType)) cur.hh += l.hoursHh;
      tipGroups.set(g, cur);
    }
    for (const [g, t] of tipGroups) {
      if (t.tips > 0 && t.hh === 0) {
        flag({ key: `tips_no_hours:${k}:${g}`, type: 'tips_no_hours', severity: 'warning', toastName: name, locationId: t.loc,
          message: `${name} has ${centsDisplay(t.tips)} in tips/gratuity as ${t.job ?? 'unknown job'} at ${locName(t.loc)} but no hours there.` });
      }
    }
    const tipsTotal = sum(TIP_TYPES).reduce((a, l) => a + l.amountCents, 0);
    if (tipsTotal > s.alert_tips_cents) {
      flag({ key: `high_tips:${k}`, type: 'high_tips', severity: 'warning', toastName: name,
        message: `${name} has ${centsDisplay(tipsTotal)} in tips this period (alert above ${centsDisplay(s.alert_tips_cents)}).` });
    }

    // Tip credit: wages + tips must reach the Ohio minimum wage for every hour (1.5× minimum for OT hours) in each workweek.
    const makeup = empLines.filter((l) => l.earningType === 'TIPCREDIT_MAKEUP').reduce((a, l) => a + l.amountCents, 0);
    const tippedHours = sum(HOURS_TYPES).filter((l) => findJob(ctx.jobs, l.locationId, l.jobTitle)?.is_tipped);
    if (tippedHours.length) {
      const weeklyWithTips = empWeeks && [...empWeeks.values()].some((w) => w.tippedHh > 0 && w.tipsCents > 0);
      let shortfall = 0;
      const detail: string[] = [];
      if (weeklyWithTips) {
        for (const [wk, w] of empWeeks!) {
          if (w.tippedHh <= 0) continue;
          const required = divRound(s.min_wage_cents * (2 * w.tippedHh + w.tippedOtHh), 200);
          const short = required - w.tippedWagesCents - w.tipsCents;
          if (short > 0) {
            shortfall += short;
            detail.push(`week of ${wk}: ${centsDisplay(w.tippedWagesCents + w.tipsCents)} for ${fmtH(w.tippedHh)}`);
          }
        }
      } else {
        const tippedJobs = new Set(tippedHours.map((l) => `${l.locationId}|${(l.jobTitle ?? '').toLowerCase()}`));
        const hrs = tippedHours.reduce((a, l) => a + l.hoursHh, 0);
        const otHrs = tippedHours.filter((l) => l.earningType === 'OT').reduce((a, l) => a + l.hoursHh, 0);
        const wages = tippedHours.reduce((a, l) => a + l.amountCents, 0);
        const tips = sum(TIP_TYPES).filter((l) => tippedJobs.has(`${l.locationId}|${(l.jobTitle ?? '').toLowerCase()}`)).reduce((a, l) => a + l.amountCents, 0);
        const required = divRound(s.min_wage_cents * (2 * hrs + otHrs), 200);
        if (required - wages - tips > 0) {
          shortfall = required - wages - tips;
          detail.push(`pay period: ${centsDisplay(wages + tips)} for ${fmtH(hrs)} (weekly check needs Time Entries with tips)`);
        }
      }
      if (shortfall - makeup > 0) {
        flag({ key: `tip_credit:${k}`, type: 'tip_credit_shortfall', severity: 'warning', toastName: name,
          message: `${name}'s wages + tips fall below the ${centsDisplay(s.min_wage_cents)}/hr minimum (${detail.join('; ')}). Suggested TIPCREDIT_MAKEUP: ${centsDisplay(shortfall - makeup)}.`,
          details: { suggestedCents: shortfall - makeup, employeeId: empLines[0].employeeId, locationId: tippedHours[0].locationId, jobTitle: tippedHours[0].jobTitle } });
      }
    }

    // Compared with the previous run.
    if (ctx.previous) {
      const prev = ctx.previous[k];
      if (!prev) {
        flag({ key: `new_employee:${k}`, type: 'new_employee', severity: 'warning', toastName: name,
          message: `${name} wasn't paid in the previous run.` });
      } else {
        const diff = Math.abs(grossCents - prev.grossCents);
        if (diff > s.big_change_min_cents && diff * 100 > prev.grossCents * s.big_change_pct) {
          flag({ key: `big_change:${k}`, type: 'big_change', severity: 'warning', toastName: name,
            message: `${name}'s estimated gross changed from ${centsDisplay(prev.grossCents)} to ${centsDisplay(grossCents)} since the previous run.` });
        }
      }
    }
  }

  if (ctx.previous) {
    for (const [k, prev] of Object.entries(ctx.previous)) {
      if (!byEmp.has(k)) {
        flag({ key: `missing_employee:${k}`, type: 'missing_employee', severity: 'warning', toastName: prev.name,
          message: `${prev.name} was paid in the previous run but has no pay this period.` });
      }
    }
  }

  // Time entries vs payroll export hours (sanity).
  for (const [k, empWeeks] of weeks) {
    const teHh = [...empWeeks.values()].reduce((a, w) => a + w.hh, 0);
    const exHh = (byEmp.get(k) ?? []).filter((l) => l.source === 'toast' && HOURS_TYPES.includes(l.earningType)).reduce((a, l) => a + l.hoursHh, 0);
    if (teHh !== exHh) {
      const name = byEmp.get(k)?.[0].toastName ?? k.replace(/^name:/, '');
      flag({ key: `te_mismatch:${k}`, type: 'time_entries_mismatch', severity: 'warning', toastName: name,
        message: `${name}: Time Entries total ${fmtH(teHh)} but the Payroll Export shows ${fmtH(exHh)}.` });
    }
  }

  return { flags, summaries: summarize(lines, files) };
}

export function summarize(lines: PayLine[], files: EngineFile[]): LocationSummary[] {
  const locIds = [...new Set([...lines.map((l) => l.locationId), ...files.filter((f) => f.kind === 'payroll_export').map((f) => f.locationId)])];
  return locIds.map((locationId) => {
    const ls = lines.filter((l) => l.locationId === locationId);
    const fs = files.filter((f) => f.kind === 'payroll_export' && !f.duplicateOf && f.locationId === locationId);
    const control = fs.length
      ? fs.map((f) => f.control ?? sumRows(f.rows)).reduce<Totals>((a, t) => ({
          regHh: a.regHh + t.regHh, otHh: a.otHh + t.otHh, regPayCents: a.regPayCents + t.regPayCents,
          otPayCents: a.otPayCents + t.otPayCents, cctipsCents: a.cctipsCents + t.cctipsCents,
          cashtipsCents: a.cashtipsCents + t.cashtipsCents, gratCents: a.gratCents + t.gratCents,
        }), { regHh: 0, otHh: 0, regPayCents: 0, otPayCents: 0, cctipsCents: 0, cashtipsCents: 0, gratCents: 0 })
      : null;
    const total = (types: string[], field: 'hoursHh' | 'amountCents') => ls.filter((l) => types.includes(l.earningType)).reduce((a, l) => a + l[field], 0);
    return {
      locationId,
      employees: new Set(ls.map((l) => employeeKey(l.employeeId, l.toastName))).size,
      regHh: total(['REG'], 'hoursHh'),
      otHh: total(['OT'], 'hoursHh'),
      tipsCents: total(TIP_TYPES, 'amountCents'),
      gratCents: total(['GRAT'], 'amountCents'),
      grossCents: ls.reduce((a, l) => a + l.amountCents, 0),
      control,
    };
  });
}

/** Estimated gross per employee key (for the next run's comparisons). */
export function grossByEmployee(lines: PayLine[]): Record<string, { name: string; grossCents: number }> {
  const out: Record<string, { name: string; grossCents: number }> = {};
  for (const l of lines) {
    const k = employeeKey(l.employeeId, l.toastName);
    out[k] = { name: l.toastName, grossCents: (out[k]?.grossCents ?? 0) + l.amountCents };
  }
  return out;
}

export const periodDayCount = (start: string, end: string) =>
  Math.round((ymdToUtc(end) - ymdToUtc(start)) / 86_400_000) + 1;

export const defaultPeriod = (settings: PayrollSettings, today: string): { start: string; end: string } => {
  const len = settings.pay_frequency === 'weekly' ? 7 : 14;
  const start = settings.next_period_start ?? weekStart(addDays(today, -len), settings.workweek_start_dow);
  return { start, end: addDays(start, len - 1) };
};
