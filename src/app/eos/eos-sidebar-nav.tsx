'use client';

import { usePathname } from 'next/navigation';
import { navModulesForUser, type NavUser } from '@/lib/nav';
import { NavList } from '@/components/nav/nav-list';

export function EosSidebarNav({ user, liveMeetingId }: { user: NavUser; liveMeetingId: string | null }) {
  const pathname = usePathname();
  return (
    <NavList
      modules={navModulesForUser(user)}
      pathname={pathname}
      variant="eos"
      overrides={{ liveMeetingId }}
    />
  );
}
