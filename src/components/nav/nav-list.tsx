'use client';

import Link from 'next/link';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { activeNavHref, contextNavModules, groupNavModules, isEosPath, type NavModule } from '@/lib/nav';
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
  const shown = contextNavModules(modules, pathname);
  const active = activeNavHref(shown, pathname);
  const inEos = isEosPath(pathname);
  // "Back to CRM" only for people who can open the CRM (EOS-only users can't, so they don't see it).
  const canCrm = modules.some((m) => m.href === '/');

  const link = (m: NavModule) => {
    const Icon = m.icon;
    const isActive = m.href === active;
    const live = m.href === '/eos/meetings' && !!overrides?.liveMeetingId;
    return (
      <Link
        key={m.href}
        href={navHref(m, overrides)}
        data-nav-href={m.href}
        data-nav-collapsed-eos={m.collapsedEos ? '' : undefined}
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
  };

  return (
    <div data-nav-list={variant}>
      {inEos && canCrm && (
        <Link href="/" onClick={onNavigate} data-nav-back-crm className={cn(s.link, s.idle, 'mt-3 font-semibold')}>
          <ArrowLeft className={cn(s.icon, 'shrink-0')} />
          <span className="flex-1 truncate">Back to CRM</span>
        </Link>
      )}
      {groupNavModules(shown, pathname).map(({ group, modules: items }) => {
        // Outside EOS: one "EOS" link, no section heading.
        if (items.every((m) => m.collapsedEos)) {
          return <section key={group} aria-label={group} className="pt-3">{items.map(link)}</section>;
        }
        // Inside EOS: the other CRM sections collapse (tap the heading to open).
        if (inEos && group !== 'EOS') {
          return (
            <details key={group} className="group/nav" data-nav-group={group}>
              <summary className={cn(s.heading, 'flex cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden')}>
                <ChevronRight className="h-3 w-3 transition-transform group-open/nav:rotate-90" />{group}
              </summary>
              <div className="space-y-0.5">{items.map(link)}</div>
            </details>
          );
        }
        return (
          <section key={group} aria-label={group} data-nav-group={group}>
            <h2 className={s.heading}>{group}</h2>
            <div className="space-y-0.5">{items.map(link)}</div>
          </section>
        );
      })}
    </div>
  );
}
