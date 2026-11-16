'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

/** A table row that opens `href` when clicked (the first cell also holds a real link for keyboard users). */
export function RowLink({ href, children }: { href: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <tr className="click" onClick={(e) => { if (!(e.target as HTMLElement).closest('a,button')) router.push(href); }}>
      {children}
    </tr>
  );
}
