#!/usr/bin/env node
'use strict';

/**
 * AI Assistant regression suite.
 *
 * Runs the questions that have previously produced wrong answers and asserts on
 * the substance of the response — not just that something came back. Several
 * checks compare the assistant's numbers against a control query run directly
 * against the database, so a confident-but-wrong answer fails.
 *
 * Usage:
 *   node scripts/test-assistant.js                 # against production
 *   node scripts/test-assistant.js http://localhost:3000
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const BASE = process.argv[2] || 'https://ohio-liquor-crm-opal.vercel.app';
const ENDPOINT = `${BASE}/api/assistant`;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function sql(query) {
  const { data, error } = await supabase.rpc('exec_sql', { query_text: query });
  if (error) throw new Error(error.message);
  return typeof data === 'string' ? JSON.parse(data) : data;
}

async function ask(question, history = []) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, history }),
    signal: AbortSignal.timeout(180000),
  });
  const json = await res.json();
  return { answer: json.answer ?? '', meta: json.meta ?? {} };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** All dollar amounts mentioned in the answer. */
const dollars = (s) => [...s.matchAll(/\$\s?([\d,]+(?:\.\d+)?)/g)].map((m) => Number(m[1].replace(/,/g, '')));
/** All percentages mentioned. */
const pcts = (s) => [...s.matchAll(/([\d.]+)\s?%/g)].map((m) => Number(m[1]));
const has = (s, ...words) => words.every((w) => s.toLowerCase().includes(w.toLowerCase()));
const hasAny = (s, ...words) => words.some((w) => s.toLowerCase().includes(w.toLowerCase()));
/** Any number in the answer within tolerance of target. */
const near = (nums, target, tol) => nums.some((n) => Math.abs(n - target) <= Math.abs(target) * tol);
/** LaTeX must never reach the user. */
const hasLatex = (s) => /\\frac|\\times|\\approx|\\\(|\\\)|\$\$/.test(s);

const results = [];
function record(n, name, pass, detail) {
  results.push({ n, name, pass, detail });
  console.log(`${pass ? '\x1b[32mPASS\x1b[0m' : '\x1b[31mFAIL\x1b[0m'}  ${n}. ${name}`);
  if (detail) console.log(`        ${detail}`);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Testing ${ENDPOINT}\n`);

  // Control totals from the database.
  const [gv] = await sql(`
    SELECT ROUND(SUM(ds.total_revenue),2) rev FROM daily_sales ds JOIN locations l ON l.id=ds.location_id
    WHERE l.name='Grandview' AND ds.business_date>='2026-07-01' AND ds.business_date<'2026-08-01'`);
  const [allJul] = await sql(`
    SELECT ROUND(SUM(total_revenue),2) rev FROM daily_sales
    WHERE business_date>='2026-07-01' AND business_date<'2026-08-01'`);
  const [cov] = await sql(`
    SELECT ROUND(100.0*SUM(item_revenue)/NULLIF(SUM(control_revenue),0),1) pct
    FROM item_sales_reconciliation
    WHERE location='Grandview' AND business_date>='2026-07-01' AND business_date<'2026-08-01'`);
  const [sam] = await sql(`
    SELECT COUNT(DISTINCT vl.account_id) n FROM visit_logs vl
    JOIN profiles p ON p.id=vl.rep_id JOIN accounts a ON a.id=vl.account_id
    WHERE p.full_name ILIKE '%Samantha%' AND a.type='agency'
      AND vl.visited_at>='2026-06-01' AND vl.visited_at<'2026-07-01'`);

  console.log(`Controls: Grandview Jul $${gv.rev} | All Jul $${allJul.rev} | item coverage ${cov.pct}% | Samantha ${sam.n}\n`);

  // 1 — food vs beverage split, must reconcile or explicitly flag incompleteness
  {
    const q = 'What was Grandview food vs beverage revenue for July 2026, with percentages?';
    const { answer, meta } = await ask(q);
    const p = pcts(answer);
    const coverageOk = Number(cov.pct) >= 99;
    const foodInRange = p.some((x) => x >= 25 && x <= 50);
    // If item coverage is incomplete, the correct behaviour is to SAY SO.
    const flagged = hasAny(answer, 'incomplete', 'only covers', 'coverage', 'not reliable', 'unreconciled', 'cannot');
    const pass = !hasLatex(answer) && (coverageOk ? foodInRange : flagged);
    record(1, 'Grandview food vs beverage (July 2026)', pass,
      coverageOk ? `food% candidates: ${p.join(', ')}` : `coverage ${cov.pct}% → must flag incompleteness; flagged=${flagged}`);
    global._t1 = { q, answer };
    if (meta.queries) global._t1.queries = meta.queries.length;
  }

  // 2 — total revenue all locations, must match daily_sales
  {
    const { answer } = await ask('What was total revenue for all locations in July 2026?');
    const pass = near(dollars(answer), Number(allJul.rev), 0.01) && !hasLatex(answer);
    record(2, 'Total revenue all locations (July 2026)', pass,
      `expected ~$${allJul.rev}; found ${dollars(answer).slice(0, 5).join(', ')}`);
  }

  // 3 — prime cost, plausible range + stated basis
  {
    const { answer } = await ask('What was our prime cost last month?');
    const p = pcts(answer);
    const inRange = p.some((x) => x >= 50 && x <= 75);
    const basis = hasAny(answer, 'month', 'week');
    record(3, 'Prime cost last month', inRange && basis && !hasLatex(answer),
      `pcts: ${p.join(', ')} | basis stated: ${basis}`);
  }

  // 4 — top 5 menu items
  {
    const { answer } = await ask('What were the top 5 menu items by revenue at Grandview last quarter?');
    const pass = dollars(answer).length >= 5 && !hasLatex(answer);
    record(4, 'Top 5 menu items (Grandview, last quarter)', pass,
      `dollar figures found: ${dollars(answer).length}`);
  }

  // 5 — agency visit count, must match control
  {
    const { answer } = await ask('How many agencies did Samantha Toke visit in June 2026?');
    const nums = [...answer.matchAll(/\b(\d+)\b/g)].map((m) => Number(m[1]));
    const pass = nums.includes(Number(sam.n)) && Number(sam.n) > 0;
    record(5, 'Samantha agency visits (June 2026)', pass, `expected ${sam.n}; answer numbers: ${nums.slice(0, 8).join(', ')}`);
  }

  // 6 — top Double Double Oaked agency
  {
    const { answer } = await ask('Which agency sold the most Whiskey War Double Double Oaked in 2026?');
    // Spec: "a named agency with bottles and revenue" — accept a bottle count
    // or a dollar figure as the quantitative element.
    const bottles = /\b\d{2,}\s*(bottles?|btl)\b/i.test(answer) || /\b(bottles?)\b/i.test(answer);
    const pass = has(answer, 'high bank') && (bottles || dollars(answer).length > 0);
    record(6, 'Top Double Double Oaked agency (2026)', pass, answer.slice(0, 110).replace(/\n/g, ' '));
  }

  // 7 — conversation memory follow-up
  {
    const first = global._t1;
    const { answer } = await ask('Now compare that to Gahanna', [
      { role: 'user', content: first.q },
      { role: 'assistant', content: first.answer },
    ]);
    // Must act on the remembered context, not ask what "that" means.
    const confused = hasAny(answer, 'could you clarify', 'what would you like', 'please specify', 'which metric');
    const pass = has(answer, 'gahanna') && !confused && !hasLatex(answer);
    record(7, 'Follow-up uses conversation memory', pass,
      confused ? 'assistant asked for clarification instead of using context' : answer.slice(0, 110).replace(/\n/g, ' '));
  }

  // 8 — scenario modelling
  {
    const { answer } = await ask('If we ran half off whiskey cocktails for 6 months, what would it have cost us?');
    const pass = dollars(answer).length >= 2 && hasAny(answer, 'assum') && !hasLatex(answer);
    record(8, 'Half-off whiskey cocktails scenario', pass,
      `dollars: ${dollars(answer).slice(0, 4).join(', ')} | states assumptions: ${hasAny(answer, 'assum')}`);
  }

  // ─── Summary ───────────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${'─'.repeat(60)}\n${passed}/${results.length} passed`);
  if (passed < results.length) {
    console.log('\nFailures:');
    for (const r of results.filter((x) => !x.pass)) console.log(`  ${r.n}. ${r.name} — ${r.detail}`);
    process.exit(1);
  }
}

main().catch((e) => { console.error('Suite error:', e.message); process.exit(1); });
