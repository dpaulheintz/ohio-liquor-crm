// Nav access matrix: builds every user's nav from the real profiles table and checks it against the
// route gates. Run: npx tsx scripts/test-nav-access.ts   (reads .env.local or $ENV_FILE; prints the matrix)
//
// Checks, for every profile (plus a synthetic demo-role user):
//  1. canOpenPath() agrees with the route gates as they stand (a copy of the proxy / layout / page
//     checks below) for every static page route — so the nav never shows a page that would bounce,
//     and never hides one the user can open.
//  2. Desktop sidebar list === mobile list (tab bar ⊆ More menu, More menu === sidebar).
//  3. Nothing the old desktop sidebar showed is gone; the only additions are EOS sub-pages and Retail Requisitions.
//  4. Spot checks for the reported bug and the user types in the brief.

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { isEosAdmin, isEosOnly, isEosUser } from '../src/lib/eos-auth';
import {
  canOpenPath, navModulesForUser, navUserFromProfile, pickTabModules, NAV_MODULES, type NavUser,
} from '../src/lib/nav';

config({ path: process.env.ENV_FILE ?? '.env.local', quiet: true });

const ROUTES = [
  '/', '/accounts', '/contacts', '/assignments', '/visits/new', '/pending-approval',
  '/admin', '/admin/assistant', '/admin/assignments', '/admin/tastings', '/admin/barrel-picks',
  '/admin/sales-dashboard', '/admin/restaurant-analytics', '/admin/restaurant-analytics/anomalies',
  '/admin/sales-upload', '/admin/account-groups', '/admin/import', '/admin/approvals', '/admin/samples',
  '/admin/secret-shopper', '/admin/wholesale-forms', '/admin/wholesale-forms/new',
  '/admin/wholesale-forms/wholesalers', '/admin/wholesale-forms/price-list', '/admin/wholesale-forms/settings',
  '/admin/retail-requisitions', '/admin/retail-requisitions/new', '/admin/retail-requisitions/sku-list',
  '/admin/kpi', '/admin/users',
  '/eos', '/eos/scorecard', '/eos/barrels', '/eos/todos', '/eos/opportunities', '/eos/headlines', '/eos/meetings',
  '/payroll', '/payroll/employees', '/payroll/jobs', '/payroll/paycodes', '/payroll/locations',
  '/payroll/template', '/payroll/settings', '/payroll/examples', '/payroll/audit',
];

// ─── The route gates, as written in the route code (independent of src/lib/nav.ts) ─────────────
function routeGateAllows(u: NavUser, path: string): boolean {
  // src/lib/supabase/proxy.ts
  if (u.role === 'pending') return path === '/pending-approval';
  const vp = u.visible_pages;
  if (vp && vp.length > 0) {
    if (!vp.some((p) => path === p || path.startsWith(p + '/'))) return false;
  } else if (path.startsWith('/admin') && u.role !== 'admin') {
    return false;
  }
  if (path === '/pending-approval') return false; // approved users are bounced to /
  // src/app/eos/layout.tsx
  if (path.startsWith('/eos')) return isEosUser(u.email);
  // src/app/payroll/layout.tsx (has_payroll_access() = profiles.payroll_access)
  if (path.startsWith('/payroll')) return u.payroll_access;
  // src/app/(app)/layout.tsx
  if (isEosOnly(u.email)) return false;
  // src/app/(app)/admin/wholesale-forms/layout.tsx (wholesale_forms_can_use) + settings/price-list pages
  if (path.startsWith('/admin/wholesale-forms')) {
    const canUse = u.role === 'admin' || (vp ?? []).includes('/admin/wholesale-forms');
    if (path.endsWith('/settings') || path.endsWith('/price-list')) return canUse && u.role === 'admin';
    return canUse;
  }
  // src/app/(app)/admin/retail-requisitions/layout.tsx (can_use_retail_requisitions) + sku-list page
  if (path.startsWith('/admin/retail-requisitions')) {
    const canUse = u.role === 'admin' || (vp ?? []).includes('/admin/retail-requisitions');
    return canUse && (!path.endsWith('/sku-list') || u.role === 'admin');
  }
  // src/app/(app)/admin/secret-shopper/page.tsx
  if (path.startsWith('/admin/secret-shopper')) return u.role === 'admin' || u.role === 'demo';
  return true;
}

// ─── The desktop nav each user actually got before this change (@ 33c9509) ───────────────────
// Pending users sit on /pending-approval (no nav); EOS-only emails are redirected out of the CRM, so
// the EOS sidebar was their only nav; everyone else had the CRM sidebar (src/components/sidebar.tsx).
const OLD_NAV = ['/', '/accounts', '/contacts', '/assignments'];
const OLD_ADMIN = [
  '/admin/assistant', '/admin', '/admin/assignments', '/admin/tastings', '/admin/barrel-picks',
  '/admin/sales-dashboard', '/admin/restaurant-analytics', '/admin/restaurant-analytics/anomalies',
  '/admin/sales-upload', '/admin/account-groups', '/admin/import', '/admin/approvals', '/admin/samples',
  '/admin/secret-shopper', '/admin/wholesale-forms', '/admin/kpi', '/admin/users',
];
const OLD_EOS = ['/eos', '/eos/scorecard', '/eos/barrels', '/eos/todos', '/eos/opportunities', '/eos/headlines', '/eos/meetings'];
function oldSidebar(u: NavUser): string[] {
  if (u.role === 'pending') return [];
  if (isEosOnly(u.email)) return u.payroll_access ? [...OLD_EOS, '/payroll'] : OLD_EOS;
  const out: string[] = [];
  if (u.visible_pages) {
    out.push(...[...OLD_NAV, ...OLD_ADMIN].filter((h) => u.visible_pages!.some((vp) => h === vp || h.startsWith(vp + '/'))));
  } else {
    out.push(...OLD_NAV);
    if (u.role === 'admin') out.push(...OLD_ADMIN);
  }
  if (u.payroll_access) out.push('/payroll');
  if (isEosAdmin(u.email)) out.push('/eos');
  return out;
}

const PAGE_ROUTES = ROUTES.filter((r) => r !== '/pending-approval');
const EOS_PAGES = NAV_MODULES.filter((m) => m.group === 'EOS').map((m) => m.href);

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing (.env.local)');
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb.from('profiles').select('email, full_name, role, visible_pages, payroll_access').order('email');
  if (error) throw new Error(error.message);

  const users = [
    ...(data ?? []).map((p) => ({ label: p.full_name || p.email, u: navUserFromProfile(p) })),
    { label: 'Demo user (synthetic: no demo-role profile exists)', u: { email: 'demo@example.test', role: 'demo', visible_pages: null, payroll_access: false } },
  ];

  const failures: string[] = [];
  const fail = (m: string) => failures.push(m);

  for (const { label, u } of users) {
    // 1. nav filter === route gates
    for (const r of ROUTES) {
      if (canOpenPath(u, r) !== routeGateAllows(u, r)) fail(`${label}: ${r} nav=${canOpenPath(u, r)} route=${routeGateAllows(u, r)}`);
    }
    const desktop = navModulesForUser(u).map((m) => m.href);
    for (const h of desktop) if (!routeGateAllows(u, h)) fail(`${label}: nav shows ${h} but the route would redirect`);

    // 2. mobile === desktop
    const tabs = pickTabModules(navModulesForUser(u), {}).map((m) => m.href);
    const more = navModulesForUser(u).map((m) => m.href);
    if (tabs.some((t) => !more.includes(t))) fail(`${label}: a tab is missing from More`);
    if (JSON.stringify(more) !== JSON.stringify(desktop)) fail(`${label}: More menu ≠ sidebar`);

    // 3. nothing lost vs the old sidebar
    const old = oldSidebar(u);
    for (const h of old) if (!desktop.includes(h)) fail(`${label}: lost ${h} from the sidebar`);
    for (const h of desktop) if (!old.includes(h) && !EOS_PAGES.includes(h) && h !== '/admin/retail-requisitions') fail(`${label}: new non-EOS item ${h}`);

    const allowed = PAGE_ROUTES.filter((r) => routeGateAllows(u, r));
    console.log(`\n■ ${label} <${u.email}>  role=${u.role}${u.visible_pages ? ' visible_pages=' + u.visible_pages.join(',') : ''}${u.payroll_access ? ' payroll' : ''}`);
    console.log(`  desktop sidebar (${desktop.length}): ${desktop.join('  ') || '—'}`);
    console.log(`  mobile tabs: ${tabs.join('  ') || '—'}  + More (${more.length}): ${JSON.stringify(more) === JSON.stringify(desktop) ? 'same list as desktop ✓' : 'DIFFERENT'}`);
    console.log(`  routes open (${allowed.length}/${PAGE_ROUTES.length}): ${allowed.join('  ') || '—'}`);
  }

  // 4. spot checks
  const by = (email: string) => users.find((x) => x.u.email === email)!.u;
  const list = (email: string) => navModulesForUser(by(email)).map((m) => m.href);
  const eq = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  if (!eq(list('distillery@highbankco.com'), ['/admin/sales-dashboard', '/admin/barrel-picks', '/admin/samples', '/admin/wholesale-forms', '/admin/retail-requisitions']))
    fail('distillery: expected exactly Sales Dashboard, Barrel Picks, Samples, Wholesale Forms, Retail Requisitions');
  if (pickTabModules(navModulesForUser(by('distillery@highbankco.com')), {}).length !== 4) fail('distillery: expected 4 tabs');
  if (list('ajones@highbankco.com').some((h) => h.startsWith('/eos'))) fail('Amy should not see EOS (not on the allowlist)');
  if (!list('pheintzman@highbankco.com').includes('/eos') || !list('ahines@highbankco.com').includes('/eos')) fail('Paul/Adam should see EOS');
  const acct = list('accounting@highbankco.com');
  const paul = list('pheintzman@highbankco.com');
  if (!eq(acct, paul.filter((h) => !h.startsWith('/eos')))) fail('accounting should = Paul minus EOS (both have Payroll)');
  const jeff = list('jireland@highbankco.com');
  if (!eq(jeff, [...EOS_PAGES, '/payroll'])) fail('Jeff should see EOS + Payroll');
  for (const rep of ['msmith@highbankco.com', 'jfisher@highbankco.com', 'ccarter@highbankco.com'])
    if (!eq(list(rep), EOS_PAGES)) fail(`${rep} should see the EOS pages (EOS-only account)`);

  console.log('');
  if (failures.length) {
    console.error(`✗ ${failures.length} failure(s):\n  ` + failures.join('\n  '));
    process.exit(1);
  }
  console.log(`✓ ${users.length} users × ${ROUTES.length} routes: nav filter = route gates, mobile = desktop, nothing lost, spot checks pass`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
