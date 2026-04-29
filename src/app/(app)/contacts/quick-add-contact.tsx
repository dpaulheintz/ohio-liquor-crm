'use client';

import { useState, useEffect } from 'react';
import { createContact } from '@/app/actions/contacts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AccountSearchDialog } from '@/components/account-search-dialog';
import { toast } from 'sonner';

interface QuickAddContactProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  defaultAccountId?: string;
  defaultAccountName?: string;
}

export function QuickAddContact({
  open,
  onOpenChange,
  onSuccess,
  defaultAccountId,
  defaultAccountName,
}: QuickAddContactProps) {
  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState(defaultAccountId ?? '');
  const [accountName, setAccountName] = useState(defaultAccountName ?? '');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [titleRole, setTitleRole] = useState('');
  const [loading, setLoading] = useState(false);

  // Reset on close
  useEffect(() => {
    if (open) {
      setName('');
      setAccountId(defaultAccountId ?? '');
      setAccountName(defaultAccountName ?? '');
      setPhone('');
      setEmail('');
      setTitleRole('');
    }
  }, [open, defaultAccountId, defaultAccountName]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !accountId) return;

    setLoading(true);
    try {
      await createContact({
        name,
        account_id: accountId,
        phone: phone || undefined,
        email: email || undefined,
        title_role: titleRole || undefined,
      });
      toast.success('Contact added');
      onOpenChange(false);
      onSuccess();
    } catch {
      toast.error('Failed to add contact');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Quick Add Contact</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="contact-name">Name *</Label>
            <Input
              id="contact-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Full name"
              style={{ textTransform: 'capitalize' }}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Account *</Label>
            {defaultAccountId ? (
              <Input value={accountName} disabled />
            ) : (
              <AccountSearchDialog
                accountId={accountId}
                accountName={accountName}
                onSelect={(id, n) => {
                  setAccountId(id);
                  setAccountName(n);
                }}
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contact-phone">Phone</Label>
            <Input
              id="contact-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contact-email">Email</Label>
            <Input
              id="contact-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contact-title">Title / Role</Label>
            <Input
              id="contact-title"
              value={titleRole}
              onChange={(e) => setTitleRole(e.target.value)}
              placeholder="e.g., Store Manager"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name || !accountId}>
              {loading ? 'Adding...' : 'Add Contact'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
