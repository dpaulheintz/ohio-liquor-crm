'use client';

import Link from 'next/link';
import { Archive, ArrowLeft } from 'lucide-react';

/**
 * Secondary "Archives" button for a page's top bar (active view only).
 * Links to `?view=archived` on the current EOS page.
 */
export function ArchiveButton({ basePath }: { basePath: string }) {
  return (
    <Link
      href={`${basePath}?view=archived`}
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-600 text-sm font-medium hover:bg-gray-100 transition-colors"
    >
      <Archive className="h-3.5 w-3.5" />
      Archives
    </Link>
  );
}

/**
 * Grey banner shown at the top of an archive view, with a link back to active.
 */
export function ArchiveBanner({ label, basePath }: { label: string; basePath: string }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3 rounded-lg bg-gray-100 border border-gray-200 px-4 py-3">
      <span className="text-sm text-gray-600 flex items-center gap-2">
        <Archive className="h-4 w-4 text-gray-400" />
        Viewing archived {label}
      </span>
      <Link
        href={basePath}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600 hover:text-green-700 transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Active
      </Link>
    </div>
  );
}
