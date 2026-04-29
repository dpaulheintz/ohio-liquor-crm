'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Building2,
  Users,
  Shield,
  LogOut,
  FileUp,
  BarChart3,
  ClipboardCheck,
  ClipboardList,
  UserCog,
  Globe,
} from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import { signOut } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/accounts', label: 'Accounts', icon: Building2 },
  { href: '/contacts', label: 'Contacts', icon: Users },
  { href: '/assignments', label: 'My Assignments', icon: ClipboardList },
];

const adminItems = [
  { href: '/admin', label: 'Admin Dashboard', icon: Shield },
  { href: '/admin/assignments', label: 'Assignments', icon: ClipboardList },
  { href: '/admin/import', label: 'Import Agencies', icon: FileUp },
  { href: '/admin/approvals', label: 'Approvals', icon: ClipboardCheck },
  { href: '/admin/kpi', label: 'KPI Report', icon: BarChart3 },
  { href: '/admin/users', label: 'Users', icon: UserCog },
];

const superAdminItems = [
  { href: '/super-admin', label: 'All Organizations', icon: Globe },
];

export function Sidebar() {
  const pathname = usePathname();
  const { profile, org, isAdmin, isSuperAdmin } = useUser();

  const appName = org?.name ?? 'CRM';

  const initials = profile?.full_name
    ? profile.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : profile?.email?.[0]?.toUpperCase() ?? '?';

  return (
    <aside className="hidden md:flex md:w-56 md:flex-col md:border-r md:bg-background">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/" className="font-serif text-lg font-bold uppercase tracking-widest truncate">
          {appName}
        </Link>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-4 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}

        {isAdmin && (
          <>
            <div className="my-3 border-t pt-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Admin
            </div>
            {adminItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </>
        )}

        {isSuperAdmin && (
          <>
            <div className="my-3 border-t pt-3 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Super Admin
            </div>
            {superAdminItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      <div className="border-t p-3">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium">
              {profile?.full_name || profile?.email}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {isSuperAdmin ? 'super admin' : profile?.role}
            </p>
          </div>
          <form action={signOut}>
            <Button variant="ghost" size="icon" type="submit" className="h-8 w-8">
              <LogOut className="h-4 w-4" />
              <span className="sr-only">Sign out</span>
            </Button>
          </form>
        </div>
      </div>
    </aside>
  );
}
