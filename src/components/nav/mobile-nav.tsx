'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut, Menu, X } from 'lucide-react';
import { signOut } from '@/app/actions/auth';
import { activeNavHref, NAV_MODULES, navModulesForUser, pickTabModules, type NavUser } from '@/lib/nav';
import { NavList, navHref, type NavLinkOverrides } from '@/components/nav/nav-list';
import { cn } from '@/lib/utils';

// Tab-bar ranking comes from per-device visit counts. The counts are read once per page load so the
// tabs don't reshuffle under the user's thumb mid-session; new visits count from the next load.
const usageKey = (email: string | null) => `hb-nav-usage:${email ?? ''}`;
const frozenUsage = new Map<string, string>();
const noSubscribe = () => () => {};

function readUsage(key: string): string {
  try {
    return localStorage.getItem(key) ?? '{}';
  } catch {
    return '{}';
  }
}

function useFrozenUsage(key: string): Record<string, number> {
  const raw = useSyncExternalStore(
    noSubscribe,
    () => {
      if (!frozenUsage.has(key)) frozenUsage.set(key, readUsage(key));
      return frozenUsage.get(key)!;
    },
    () => '{}',
  );
  return useMemo(() => {
    try {
      return JSON.parse(raw) as Record<string, number>;
    } catch {
      return {};
    }
  }, [raw]);
}

function bumpUsage(key: string, href: string) {
  try {
    const counts = JSON.parse(readUsage(key)) as Record<string, number>;
    counts[href] = (counts[href] ?? 0) + 1;
    localStorage.setItem(key, JSON.stringify(counts));
  } catch {
    // storage unavailable (private mode) — tabs just keep their default order
  }
}

// Full-screen views with their own exit, where the tab bar would only get in the way.
const FULL_SCREEN = [/^\/eos\/meetings\/[^/]+\/run(\/|$)/];

export function MobileNav({
  user,
  name,
  overrides,
}: {
  user: NavUser;
  name: string | null;
  overrides?: NavLinkOverrides;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const modules = useMemo(
    () => navModulesForUser(user),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user.email, user.role, user.payroll_access, user.visible_pages?.join('|')],
  );
  const key = usageKey(user.email);
  const usage = useFrozenUsage(key);
  const picked = new Set(pickTabModules(modules, usage).map((m) => m.href));
  const tabs = NAV_MODULES.filter((m) => picked.has(m.href)); // keep the config order, so tabs read left-to-right consistently
  const active = activeNavHref(modules, pathname);

  useEffect(() => {
    if (active) bumpUsage(key, active);
  }, [key, active]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (FULL_SCREEN.some((re) => re.test(pathname))) return null;

  const moreActive = open || (active !== null && !picked.has(active));

  return (
    <>
      <nav
        aria-label="Main"
        data-mobile-tabbar
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur-sm md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex h-14 items-stretch">
          {tabs.map((m) => {
            const Icon = m.icon;
            const isActive = !open && m.href === active;
            return (
              <Link
                key={m.href}
                href={navHref(m, overrides)}
                data-nav-href={m.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
                  isActive ? 'text-primary' : 'text-muted-foreground active:text-foreground',
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="max-w-full truncate px-1">{m.short ?? m.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            data-nav-more
            className={cn(
              'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
              moreActive ? 'text-primary' : 'text-muted-foreground active:text-foreground',
            )}
          >
            <Menu className="h-5 w-5" />
            <span>More</span>
          </button>
        </div>
      </nav>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="All modules"
          data-nav-sheet
          className="fixed inset-0 z-[60] flex flex-col bg-background md:hidden"
        >
          <div
            className="flex h-14 shrink-0 items-center justify-between border-b px-4"
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)', boxSizing: 'content-box' }}
          >
            <span className="font-serif text-lg font-bold uppercase tracking-widest">High Bank</span>
            <button
              ref={closeRef}
              type="button"
              onClick={() => setOpen(false)}
              className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
              aria-label="Close menu"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain px-2 pb-4">
            <NavList
              modules={modules}
              pathname={pathname}
              variant="sheet"
              overrides={overrides}
              onNavigate={() => setOpen(false)}
            />
          </div>

          <div
            className="flex shrink-0 items-center gap-3 border-t px-4 pt-3"
            style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{name || user.email}</p>
              {name && <p className="truncate text-xs text-muted-foreground">{user.email}</p>}
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium text-muted-foreground active:bg-muted"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
