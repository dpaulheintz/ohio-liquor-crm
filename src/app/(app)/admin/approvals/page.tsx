'use client';

import { useState, useEffect, useCallback } from 'react';
import { getPendingApprovalAccounts } from '@/app/actions/accounts';
import { approveAccount } from '@/app/actions/accounts';
import { Account } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, ClipboardCheck } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

export default function ApprovalsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPendingApprovalAccounts();
      setAccounts(data);
    } catch (err) {
      console.error('Failed to fetch pending accounts:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  async function handleApprove(id: string) {
    try {
      await approveAccount(id);
      toast.success('Account approved');
      fetchAccounts();
    } catch {
      toast.error('Failed to approve account');
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold">Account Approval Queue</h1>
      <p className="text-sm text-muted-foreground">
        Wholesale accounts auto-created from CSV uploads need review before they
        become active.
      </p>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : accounts.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <ClipboardCheck className="mx-auto mb-3 h-10 w-10" />
          <p>No accounts pending approval</p>
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map((account) => (
            <Card key={account.id}>
              <CardContent className="p-3 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/accounts/${account.id}`}
                      className="font-medium text-sm hover:underline truncate"
                    >
                      {account.display_name}
                    </Link>
                    <Badge variant="secondary" className="text-xs shrink-0">
                      Wholesale
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    {account.permit_number && (
                      <span>Permit: {account.permit_number}</span>
                    )}
                    {account.legal_name && (
                      <span>Legal: {account.legal_name}</span>
                    )}
                    {account.district && (
                      <span>District: {account.district}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Link href={`/accounts/${account.id}`}>
                    <Button size="sm" variant="outline">
                      Review
                    </Button>
                  </Link>
                  <Button size="sm" onClick={() => handleApprove(account.id)}>
                    <CheckCircle className="mr-1 h-4 w-4" />
                    Approve
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
