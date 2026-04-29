'use client';

import { toggleOrgActive } from '@/app/actions/super-admin';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

export function OrgToggleButton({
  orgId,
  isActive,
  orgName,
}: {
  orgId: string;
  isActive: boolean;
  orgName: string;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleToggle() {
    setLoading(true);
    try {
      await toggleOrgActive(orgId, !isActive);
      toast.success(`${orgName} ${isActive ? 'deactivated' : 'activated'}`);
      router.refresh();
    } catch {
      toast.error('Failed to update organization status');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleToggle}
      disabled={loading}
      className="text-xs h-7"
    >
      {isActive ? 'Deactivate' : 'Activate'}
    </Button>
  );
}
