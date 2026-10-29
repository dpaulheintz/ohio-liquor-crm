'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import { signOut } from '@/app/actions/auth';
import { navModulesForUser, navUserFromProfile } from '@/lib/nav';
import { NavList } from '@/components/nav/nav-list';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

export function Sidebar() {
  const pathname = usePathname();
  const { profile } = useUser();
  const modules = navModulesForUser(navUserFromProfile(profile));

  const initials = profile?.full_name
    ? profile.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : profile?.email?.[0]?.toUpperCase() ?? '?';

  return (
    <aside className="hidden md:flex md:w-56 md:flex-col md:border-r border-sidebar-border md:bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center border-b border-sidebar-border px-4">
        <Link href="/" className="font-serif text-lg font-bold uppercase tracking-widest truncate text-sidebar-foreground">
          High Bank CRM
        </Link>
      </div>

      <nav aria-label="Main" className="flex-1 px-2 pb-4 overflow-y-auto">
        <NavList modules={modules} pathname={pathname} variant="sidebar" />
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs bg-sidebar-accent text-sidebar-accent-foreground">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-sidebar-foreground">
              {profile?.full_name || profile?.email}
            </p>
            <p className="truncate text-xs text-sidebar-foreground/50">
              {profile?.role}
            </p>
          </div>
          <form action={signOut}>
            <Button variant="ghost" size="icon" type="submit" className="h-8 w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50">
              <LogOut className="h-4 w-4" />
              <span className="sr-only">Sign out</span>
            </Button>
          </form>
        </div>
      </div>
    </aside>
  );
}
