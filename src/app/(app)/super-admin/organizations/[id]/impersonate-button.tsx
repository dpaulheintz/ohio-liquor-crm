'use client';

import { startImpersonation } from '@/app/actions/super-admin';
import { Button } from '@/components/ui/button';
import { Eye } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

export function ImpersonateButton({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleImpersonate() {
    setLoading(true);
    try {
      await startImpersonation(orgId, orgName);
      toast.success(`Now viewing as ${orgName}`);
      router.push('/');
      router.refresh();
    } catch {
      toast.error('Failed to start impersonation');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleImpersonate} disabled={loading}>
      <Eye className="mr-1.5 h-4 w-4" />
      View as Org
    </Button>
  );
}
