'use client';

import Link from 'next/link';
import { activeNavHref, groupNavModules, type NavModule } from '@/lib/nav';
import { cn } from '@/lib/utils';

export interface NavLinkOverrides {
  /** In-progress EOS meeting: Meetings links straight to its runner and shows a Live dot. */
  liveMeetingId?: string | null;
}

export function navHref(m: NavModule, o?: NavLinkOverrides): string {
  if (m.href === '/eos/meetings' && o?.liveMeetingId) return `/eos/meetings/${o.liveMeetingId}/run`;
  return m.href;
}

const STYLES = {
  // Dark CRM sidebar
  sidebar: {
    heading: 'px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/40',
    link: 'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
    active: 'bg-sidebar-accent text-sidebar-accent-foreground',
    idle: 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
    icon: 'h-4 w-4',
  },
  // Light EOS sidebar
  eos: {
    heading: 'px-3 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400',
    link: 'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
    active: 'bg-green-50 text-green-700',
    idle: 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
    icon: 'h-4 w-4',
  },
  // Full-screen mobile More menu
  sheet: {
    heading: 'px-4 pt-5 pb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground',
    link: 'flex min-h-12 items-center gap-3 rounded-lg px-4 text-base font-medium transition-colors',
    active: 'bg-primary/10 text-primary',
    idle: 'text-foreground active:bg-muted',
    icon: 'h-5 w-5',
  },
} as const;

export function NavList({
  modules,
  pathname,
  variant,
  overrides,
  onNavigate,
}: {
  modules: NavModule[];
  pathname: string;
  variant: keyof typeof STYLES;
  overrides?: NavLinkOverrides;
  onNavigate?: () => void;
}) {
  const s = STYLES[variant];
  const active = activeNavHref(modules, pathname);

  return (
    <div data-nav-list={variant}>
      {groupNavModules(modules, pathname).map(({ group, modules: items }) => (
        <section key={group} aria-label={group}>
          <h2 className={s.heading}>{group}</h2>
          <div className="space-y-0.5">
            {items.map((m) => {
              const Icon = m.icon;
              const isActive = m.href === active;
              const live = m.href === '/eos/meetings' && !!overrides?.liveMeetingId;
              return (
                <Link
                  key={m.href}
                  href={navHref(m, overrides)}
                  data-nav-href={m.href}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={onNavigate}
                  className={cn(s.link, isActive ? s.active : s.idle)}
                >
                  <Icon className={cn(s.icon, 'shrink-0')} />
                  <span className="flex-1 truncate">{m.label}</span>
                  {live && (
                    <span className="flex items-center gap-1 shrink-0 text-[10px] font-medium text-green-600">
                      <span className="h-2 w-2 rounded-full bg-green-600 animate-pulse" />
                      Live
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
