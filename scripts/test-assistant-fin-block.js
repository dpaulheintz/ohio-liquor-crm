'use strict';
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Proves the AI Assistant cannot read accounting (fin_*) data.
 *
 * The assistant runs SQL through exec_sql (SECURITY INVOKER) with the service-role key, so it can
 * only read what service_role is granted. Every fin_* table grants service_role nothing, and the
 * accounting functions refuse anyone without profiles.accounting_access.
 *
 * Usage: node scripts/test-assistant-fin-block.js   (needs .env.local with the service-role key)
 * Exits non-zero if any fin_* table or function is readable.
 */
require('dotenv').config({ path: process.env.ENV_FILE || '.env.local', quiet: true });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const run = (query) => supabase.rpc('exec_sql', { query_text: query });
const denied = (res) => !!res.error && /permission denied|not authorized/i.test(res.error.message);

(async () => {
  let failures = 0;
  const check = (label, ok, detail) => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
    if (!ok) failures++;
  };

  // 1. The assistant still works for normal data.
  const normal = await run('select count(*) as n from accounts');
  check('assistant can still query non-accounting tables', !normal.error, normal.error?.message);

  // 2. Every fin_* table (including any added later) grants service_role nothing.
  const { data: tables, error: listErr } = await run(
    "select c.relname as tbl, has_table_privilege('service_role', c.oid, 'SELECT') as can_select " +
    "from pg_class c join pg_namespace n on n.oid = c.relnamespace " +
    "where n.nspname = 'public' and c.relkind in ('r','v','m','p') and c.relname like 'fin\\_%' order by 1",
  );
  check('list fin_* tables', !listErr && Array.isArray(tables) && tables.length >= 11, listErr?.message ?? `${tables?.length ?? 0} tables`);

  for (const { tbl: t, can_select } of tables ?? []) {
    check(`service_role has no SELECT on ${t}`, can_select === false);
    const res = await run(`select * from public.${t} limit 1`);
    check(`exec_sql cannot read ${t}`, denied(res), res.error?.message ?? 'returned rows!');
  }

  // 3. Disguised access (dynamic SQL inside a function) is blocked the same way.
  const sneaky = await run("select * from query_to_xml('select * from fin' || '_lines', true, true, '')");
  check('disguised query_to_xml(...) is blocked', denied(sneaky), sneaky.error?.message ?? 'returned data!');

  // 4. The accounting functions refuse the assistant too (no auth.uid() → no accounting access).
  const fn = await run("select public.fin_cross_check_sources('2026-01-01', '2026-01-01') as x");
  check('exec_sql cannot call fin_cross_check_sources()', denied(fn), fn.error?.message ?? 'returned data!');
  const has = await run('select public.has_accounting_access() as ok');
  check('has_accounting_access() is false for the assistant', !!has.error || has.data?.[0]?.ok === false, has.error?.message ?? JSON.stringify(has.data));

  // 5. Direct PostgREST reads with the service-role key are refused as well.
  const direct = await supabase.from('fin_lines').select('amount').limit(1);
  check('service-role REST read of fin_lines is refused', !!direct.error, direct.error?.message ?? 'returned rows!');

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed: the assistant cannot read accounting data.');
  process.exit(failures ? 1 : 0);
})();
