// One source of truth for navigation. The desktop sidebar (CRM and EOS) and the mobile tab bar +
// More menu (CRM, EOS, Payroll) are all built from NAV_MODULES, filtered by canOpenPath(), which
// mirrors the gates the routes themselves enforce (src/lib/supabase/proxy.ts, the (app) layout,
// the EOS and Payroll layouts, and the wholesale / secret-shopper page checks). A module added here
// shows up everywhere for exactly the users who can open it.

import type { LucideIcon } from 'lucide-react';
import {
  Home, Building2, Users, Shield, FileUp, BarChart3, ClipboardCheck, ClipboardList, UserCog,
  GlassWater, BarChart2, Layers, TrendingUp, UtensilsCrossed, AlertTriangle, Package, Sparkles,
  Wine, Eye, FileText, Wallet, LayoutDashboard, Gauge, Target, CheckSquare, Lightbulb, Newspaper,
  Handshake,
} from 'lucide-react';
import { isEosOnly, isEosUser } from '@/lib/eos-auth';

export type NavGroup = 'Sales' | 'Restaurant' | 'Operations' | 'EOS' | 'Admin';
export const NAV_GROUPS: NavGroup[] = ['Sales', 'Restaurant', 'Operations', 'EOS', 'Admin'];

export interface NavModule {
  href: string;
  label: string;
  /** Short label for the mobile tab bar. */
  short?: string;
  icon: LucideIcon;
  group: NavGroup;
  /** Default rank for the mobile tab bar until the user's own usage takes over (higher = first). */
  priority: number;
}

export const NAV_MODULES: NavModule[] = [
  { href: '/', label: 'Home', icon: Home, group: 'Sales', priority: 100 },
  { href: '/accounts', label: 'Accounts', icon: Building2, group: 'Sales', priority: 95 },
  { href: '/assignments', label: 'My Assignments', short: 'My Tasks', icon: ClipboardList, group: 'Sales', priority: 90 },
  { href: '/contacts', label: 'Contacts', icon: Users, group: 'Sales', priority: 60 },
  { href: '/admin/sales-dashboard', label: 'Sales Dashboard', short: 'Sales', icon: TrendingUp, group: 'Sales', priority: 70 },
  { href: '/admin/assignments', label: 'Assignments', icon: ClipboardList, group: 'Sales', priority: 30 },
  { href: '/admin/tastings', label: 'Tastings', icon: GlassWater, group: 'Sales', priority: 30 },
  { href: '/admin/samples', label: 'Samples Dashboard', short: 'Samples', icon: Package, group: 'Sales', priority: 40 },
  { href: '/admin/kpi', label: 'KPI Report', short: 'KPI', icon: BarChart3, group: 'Sales', priority: 30 },
  { href: '/admin/account-groups', label: 'Account Groups', icon: Layers, group: 'Sales', priority: 10 },

  { href: '/admin/restaurant-analytics', label: 'Restaurant Analytics', short: 'Restaurant', icon: UtensilsCrossed, group: 'Restaurant', priority: 50 },
  { href: '/admin/restaurant-analytics/anomalies', label: 'Weekly Anomalies', short: 'Anomalies', icon: AlertTriangle, group: 'Restaurant', priority: 20 },
  { href: '/admin/secret-shopper', label: 'Secret Shopper', short: 'Shopper', icon: Eye, group: 'Restaurant', priority: 20 },

  { href: '/admin/barrel-picks', label: 'Barrel Picks', short: 'Barrels', icon: Wine, group: 'Operations', priority: 75 },
  { href: '/admin/wholesale-forms', label: 'Wholesale Forms', short: 'Wholesale', icon: FileText, group: 'Operations', priority: 80 },
  { href: '/payroll', label: 'Payroll', icon: Wallet, group: 'Operations', priority: 45 },
  { href: '/admin/sales-upload', label: 'Sales Upload', short: 'Upload', icon: BarChart2, group: 'Operations', priority: 10 },
  { href: '/admin/import', label: 'Import Agencies', short: 'Import', icon: FileUp, group: 'Operations', priority: 5 },

  { href: '/eos', label: 'EOS Dashboard', short: 'EOS', icon: LayoutDashboard, group: 'EOS', priority: 85 },
  { href: '/eos/scorecard', label: 'Scorecard', icon: Gauge, group: 'EOS', priority: 65 },
  { href: '/eos/barrels', label: 'Barrels (Rocks)', short: 'Rocks', icon: Target, group: 'EOS', priority: 35 },
  { href: '/eos/todos', label: 'To-Dos', icon: CheckSquare, group: 'EOS', priority: 62 },
  { href: '/eos/opportunities', label: 'Opportunities', short: 'Issues', icon: Lightbulb, group: 'EOS', priority: 25 },
  { href: '/eos/headlines', label: 'Headlines', icon: Newspaper, group: 'EOS', priority: 15 },
  { href: '/eos/meetings', label: 'Meetings', icon: Handshake, group: 'EOS', priority: 61 },

  { href: '/admin', label: 'Admin Dashboard', short: 'Admin', icon: Shield, group: 'Admin', priority: 55 },
  { href: '/admin/assistant', label: 'AI Assistant', short: 'Assistant', icon: Sparkles, group: 'Admin', priority: 20 },
  { href: '/admin/approvals', label: 'Approvals', icon: ClipboardCheck, group: 'Admin', priority: 15 },
  { href: '/admin/users', label: 'Users', icon: UserCog, group: 'Admin', priority: 10 },
];

/** The profile fields the route gates look at. */
export interface NavUser {
  email: string | null;
  role: string | null;
  visible_pages: string[] | null;
  payroll_access: boolean;
}

export function isRestricted(u: Pick<NavUser, 'visible_pages'>): boolean {
  return !!u.visible_pages && u.visible_pages.length > 0;
}

/** The proxy's rule for restricted users (profiles.visible_pages). */
export function pathInVisiblePages(visiblePages: string[], path: string): boolean {
  return visiblePages.some((vp) => path === vp || path.startsWith(vp + '/'));
}

/**
 * Whether this user can open `path` — the same chain of checks the request goes through:
 * proxy (pending, visible_pages, /admin for admins) → EOS layout (email allowlist) → Payroll layout
 * (payroll_access) → (app) layout (EOS-only emails go to /eos) → page checks (wholesale, secret shopper).
 */
export function canOpenPath(u: NavUser, path: string): boolean {
  if (u.role === 'pending') return path === '/pending-approval';
  if (path === '/pending-approval') return false; // approved users are sent on to /

  if (isRestricted(u)) {
    if (!pathInVisiblePages(u.visible_pages!, path)) return false;
  } else if (path.startsWith('/admin') && u.role !== 'admin') {
    return false;
  }

  if (path === '/eos' || path.startsWith('/eos/')) return isEosUser(u.email);
  if (path === '/payroll' || path.startsWith('/payroll/')) return u.payroll_access;

  if (isEosOnly(u.email)) return false;

  if (path === '/admin/wholesale-forms' || path.startsWith('/admin/wholesale-forms/')) {
    const canUse = u.role === 'admin' || (u.visible_pages ?? []).includes('/admin/wholesale-forms');
    const adminOnly = path.endsWith('/settings') || path.endsWith('/price-list');
    return canUse && (!adminOnly || u.role === 'admin');
  }
  if (path === '/admin/secret-shopper' || path.startsWith('/admin/secret-shopper/')) {
    return u.role === 'admin' || u.role === 'demo';
  }
  return true;
}

export function navModulesForUser(u: NavUser): NavModule[] {
  return NAV_MODULES.filter((m) => canOpenPath(u, m.href));
}

/** Modules by group. Inside EOS the EOS group leads; everywhere else the standard order. */
export function groupNavModules(modules: NavModule[], pathname = ''): { group: NavGroup; modules: NavModule[] }[] {
  const lead: NavGroup | null = pathname === '/eos' || pathname.startsWith('/eos/') ? 'EOS' : null;
  const order = lead ? [lead, ...NAV_GROUPS.filter((g) => g !== lead)] : NAV_GROUPS;
  return order.map((group) => ({ group, modules: modules.filter((m) => m.group === group) })).filter(
    (g) => g.modules.length > 0,
  );
}

/** The module the current page belongs to: the most specific href that matches. */
export function activeNavHref(modules: NavModule[], pathname: string): string | null {
  let best: string | null = null;
  for (const m of modules) {
    const hit = m.href === '/' ? pathname === '/' : pathname === m.href || pathname.startsWith(m.href + '/');
    if (hit && (!best || m.href.length > best.length)) best = m.href;
  }
  return best;
}

/** The mobile tab bar: the user's most-used modules (visit counts), falling back to default priority. */
export function pickTabModules(modules: NavModule[], counts: Record<string, number>, n = 4): NavModule[] {
  return [...modules]
    .sort((a, b) => (counts[b.href] ?? 0) - (counts[a.href] ?? 0) || b.priority - a.priority)
    .slice(0, n);
}

export function navUserFromProfile(
  p: { email?: string | null; role?: string | null; visible_pages?: string[] | null; payroll_access?: boolean | null } | null,
  fallbackEmail: string | null = null,
): NavUser {
  return {
    email: p?.email ?? fallbackEmail,
    role: p?.role ?? null,
    visible_pages: p?.visible_pages ?? null,
    payroll_access: p?.payroll_access === true,
  };
}
