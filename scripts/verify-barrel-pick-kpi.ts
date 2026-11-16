// Verifies the Barrel Pick KPI end to end against the live database, then removes its test data.
//   ENV_FILE=/path/.env.local npx tsx scripts/verify-barrel-pick-kpi.ts [old-kpi-payouts.ts]
// 1. Every existing KPI pays exactly what it did before (old vs new computePayouts), if the old file is given.
// 2. Logs 4 Barrel Picks on a test visit; checks each payout and that the rep's QTD total rises by $1,400.
// 3. Checks the DB rejects a Barrel Pick without a barrel type, and barrel fields on other KPI types.
// 4. Deletes the test visit (KPIs cascade).
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type { KpiEventRow } from '../src/app/actions/kpi';
import { computePayouts, currentQuarterOption } from '../src/lib/kpi-payouts';

config({ path: process.env.ENV_FILE ?? '.env.local', quiet: true });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const REP_EMAIL = 'pheintzman@highbankco.com';
let failed = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failed++; };

async function loadEvents(): Promise<KpiEventRow[]> {
  const { data, error } = await db.from('visit_kpis').select(`
    id, kpi_type, kpi_quantity, sold_status, display_type, barrel_type, is_half_barrel,
    visit:visit_logs!visit_kpis_visit_id_fkey(id, visited_at, visit_type, account_id, rep_id,
      rep:profiles!visit_logs_rep_id_fkey(id, full_name, email))`).limit(5000);
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id, visit_id: r.visit?.id ?? '', visited_at: r.visit?.visited_at ?? '', kpi: r.kpi_type,
    kpi_quantity: r.kpi_quantity ?? 1, sold_status: r.sold_status ?? 'sold', display_type: r.display_type,
    barrel_type: r.barrel_type, is_half_barrel: r.is_half_barrel === true, notes: null,
    visit_type: r.visit?.visit_type ?? 'in_person', rep_id: r.visit?.rep_id ?? '', rep_name: r.visit?.rep?.full_name ?? null,
    rep_email: r.visit?.rep?.email ?? '', account_id: r.visit?.account_id ?? '', account_name: '', account_city: null,
    account_agency_id: null, photo_count: 0, photo_urls: [],
  }));
}

function repQtd(events: KpiEventRow[], repId: string): number {
  const q = currentQuarterOption();
  const pay = computePayouts(events);
  return events
    .filter((e) => e.rep_id === repId && e.visited_at.slice(0, 10) >= q.from && e.visited_at.slice(0, 10) <= q.to)
    .reduce((s, e) => s + (pay.get(e.id) ?? 0), 0);
}

async function main() {
  const before = await loadEvents();

  // 1. Existing KPIs unchanged
  const oldPath = process.argv[2];
  if (oldPath) {
    const old = (await import(oldPath)) as { computePayouts: (e: readonly KpiEventRow[]) => Map<string, number> };
    const a = old.computePayouts(before), b = computePayouts(before);
    const diffs = before.filter((e) => a.get(e.id) !== b.get(e.id));
    const sum = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0);
    check(diffs.length === 0, `all ${before.length} existing KPIs pay the same (old $${sum(a)} = new $${sum(b)})`);
  }

  const { data: rep } = await db.from('profiles').select('id').eq('email', REP_EMAIL).single();
  const { data: acct } = await db.from('accounts').select('id').limit(1).single();
  if (!rep || !acct) throw new Error('rep/account not found');
  const qtdBefore = repQtd(before, rep.id);

  // 2. Test visit + 4 Barrel Picks (rows shaped exactly like kpiRecord() in src/app/actions/visits.ts)
  const { data: visit, error: vErr } = await db.from('visit_logs').insert({
    account_id: acct.id, rep_id: rep.id, visit_type: 'in_person', visited_at: new Date().toISOString(),
    notes: 'TEST — Barrel Pick KPI verification (auto-deleted)', kpi: null, kpi_quantity: null,
  }).select('id').single();
  if (vErr) throw vErr;
  try {
    const picks = [
      { barrel_type: 'Barrel Select', is_half_barrel: false, expect: 500 },
      { barrel_type: 'Cigar Cask', is_half_barrel: true, expect: 250 },
      { barrel_type: 'Double Double Oaked', is_half_barrel: false, expect: 500 },
      { barrel_type: 'Double Oaked', is_half_barrel: true, expect: 150 },
    ];
    const { data: rows, error: kErr } = await db.from('visit_kpis').insert(picks.map((p) => ({
      visit_id: visit.id, kpi_type: 'Barrel Pick', kpi_quantity: 1, sold_status: null, display_type: null,
      barrel_type: p.barrel_type, is_half_barrel: p.is_half_barrel,
    }))).select('id, barrel_type, sold_status');
    if (kErr) throw kErr;

    const after = await loadEvents();
    const pay = computePayouts(after);
    for (const p of picks) {
      const row = rows!.find((r) => r.barrel_type === p.barrel_type)!;
      const got = pay.get(row.id);
      check(got === p.expect, `${p.barrel_type} ${p.is_half_barrel ? 'half' : 'full'} → $${got} (expected $${p.expect})`);
    }
    check(rows!.every((r) => r.sold_status === 'sold'), 'sold_status filled by the DB default (toggle hidden)');
    const qtdAfter = repQtd(after, rep.id);
    check(qtdAfter - qtdBefore === 1400, `rep QTD $${qtdBefore} → $${qtdAfter} (+$${qtdAfter - qtdBefore}, expected +$1,400)`);

    // 3. Constraints
    const noType = await db.from('visit_kpis').insert({ visit_id: visit.id, kpi_type: 'Barrel Pick', kpi_quantity: 1 });
    check(!!noType.error, `DB rejects a Barrel Pick with no barrel type${noType.error ? ` (${noType.error.message})` : ''}`);
    const menuBarrel = await db.from('visit_kpis').insert({ visit_id: visit.id, kpi_type: 'Menu', kpi_quantity: 1, barrel_type: 'Cigar Cask' });
    check(!!menuBarrel.error, 'DB rejects barrel_type on a Menu KPI');
    const badType = await db.from('visit_kpis').insert({ visit_id: visit.id, kpi_type: 'Barrel Pick', kpi_quantity: 1, barrel_type: 'Rye' });
    check(!!badType.error, 'DB rejects an unknown barrel type');
  } finally {
    // 4. Clean up
    await db.from('visit_logs').delete().eq('id', visit.id);
    const { count } = await db.from('visit_kpis').select('id', { count: 'exact', head: true }).eq('visit_id', visit.id);
    const { count: vCount } = await db.from('visit_logs').select('id', { count: 'exact', head: true }).eq('id', visit.id);
    check(count === 0 && vCount === 0, 'test visit and its 4 KPIs deleted');
  }
  console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) FAILED.`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
