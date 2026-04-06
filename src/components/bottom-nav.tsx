'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Building2, Users, Shield, Plus } from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/accounts', label: 'Accounts', icon: Building2 },
  { href: '/contacts', label: 'Contacts', icon: Users },
];

const adminItem = { href: '/admin', label: 'Admin', icon: Shield };

export function BottomNav() {
  const pathname = usePathname();
  const { isAdmin } = useUser();

  const items = isAdmin ? [...navItems, adminItem] : navItems;

  return (
    <>
      {/* FAB - Log Visit */}
      <Link
        href="/visits/new"
        className="fixed bottom-24 right-4 z-40 md:bottom-6"
        style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <Button size="lg" className="h-14 w-14 rounded-full shadow-lg">
          <Plus className="h-6 w-6" />
          <span className="sr-only">Log Visit</span>
        </Button>
      </Link>

      {/* Bottom Tab Bar (mobile) */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-center justify-around">
          {items.map((item) => {
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
                  'flex flex-1 flex-col items-center gap-1 py-3 text-xs transition-colors',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
