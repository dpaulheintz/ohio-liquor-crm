'use client';

import { stopImpersonation } from '@/app/actions/super-admin';
import { useRouter } from 'next/navigation';
import { Eye, X } from 'lucide-react';

export function ImpersonationBanner({ orgName }: { orgName: string }) {
  const router = useRouter();

  async function handleStop() {
    await stopImpersonation();
    router.push('/super-admin/organizations');
    router.refresh();
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] flex h-10 items-center justify-center gap-3 bg-amber-500 text-sm font-medium text-black">
      <Eye className="h-4 w-4" />
      <span>Viewing as <strong>{orgName}</strong> — data is read-only</span>
      <button
        onClick={handleStop}
        className="ml-2 flex items-center gap-1 rounded-md bg-black/10 px-2 py-0.5 text-xs hover:bg-black/20"
      >
        <X className="h-3 w-3" />
        Exit
      </button>
    </div>
  );
}
