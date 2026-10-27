'use strict';
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Proves the AI Assistant cannot read payroll data.
 *
 * The assistant runs SQL through exec_sql (SECURITY INVOKER) with the service-role key, so it can
 * only read what service_role is granted. Payroll tables grant service_role nothing.
 *
 * Usage: node scripts/test-assistant-payroll-block.js   (needs .env.local with the service-role key)
 * Exits non-zero if any payroll table is readable.
 */
require('dotenv').config({ path: process.env.ENV_FILE || '.env.local', quiet: true });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const run = (query) => supabase.rpc('exec_sql', { query_text: query });

(async () => {
  let failures = 0;
  const check = (label, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
    if (!ok) failures++;
  };

  // 1. The assistant still works for normal data.
  const normal = await run('select count(*) as n from accounts');
  check('assistant can still query non-payroll tables', !normal.error, normal.error?.message);

  // 2. Every payroll_* table (including any added later) grants service_role nothing.
  const { data: tables, error: listErr } = await run(
    "select c.relname as tbl, has_table_privilege('service_role', c.oid, 'SELECT') as can_select " +
    "from pg_class c join pg_namespace n on n.oid = c.relnamespace " +
    "where n.nspname = 'public' and c.relkind in ('r','v','m','p') and c.relname like 'payroll%' order by 1",
  );
  check('list payroll tables', !listErr && Array.isArray(tables) && tables.length > 0, listErr?.message ?? `${tables?.length ?? 0} tables`);

  // (exec_sql wraps queries as a subquery aliased "t", so the column must not be named t.)
  for (const { tbl: t, can_select } of tables ?? []) {
    check(`service_role has no SELECT on ${t}`, can_select === false);
    const res = await run(`select * from public.${t} limit 1`);
    check(`exec_sql cannot read ${t}`, !!res.error && /permission denied/i.test(res.error.message), res.error?.message ?? 'returned rows!');
  }

  // 3. Disguised access (dynamic SQL inside a function) is blocked the same way.
  const sneaky = await run("select * from query_to_xml('select * from pay' || 'roll_employees', true, true, '')");
  check('disguised query_to_xml(...) is blocked', !!sneaky.error && /permission denied/i.test(sneaky.error.message), sneaky.error?.message ?? 'returned data!');

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed: the assistant cannot read payroll data.');
  process.exit(failures ? 1 : 0);
})();
