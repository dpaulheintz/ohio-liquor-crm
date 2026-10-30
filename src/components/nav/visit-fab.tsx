'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Pages with their own bottom action bar, where the button would sit on top of it.
const HIDE_ON = ['/admin/wholesale-forms', '/admin/retail-requisitions'];

/** Log Visit button — sits above the mobile tab bar, bottom-right on desktop. */
export function VisitFab() {
  const pathname = usePathname();
  if (HIDE_ON.some((p) => pathname === p || pathname.startsWith(p + '/'))) return null;
  return (
    <Link href="/visits/new" className="fixed bottom-[calc(var(--mobile-nav-h)+1rem)] right-4 z-40 md:bottom-6">
      <Button size="lg" className="h-14 w-14 rounded-full shadow-lg">
        <Plus className="h-6 w-6" />
        <span className="sr-only">Log Visit</span>
      </Button>
    </Link>
  );
}
