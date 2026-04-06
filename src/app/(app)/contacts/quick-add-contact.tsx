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
import { useAccountSearch } from '@/hooks/useAccountSearch';
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

  const acctSearch = useAccountSearch();

  // Reset on close
  useEffect(() => {
    if (open) {
      setName('');
      setAccountId(defaultAccountId ?? '');
      setAccountName(defaultAccountName ?? '');
      setPhone('');
      setEmail('');
      setTitleRole('');
      acctSearch.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="contact-account">Account *</Label>
            {defaultAccountId ? (
              <Input id="contact-account" value={accountName} disabled />
            ) : accountId ? (
              <div className="relative">
                <Input id="contact-account" value={accountName} readOnly />
                <button
                  type="button"
                  onClick={() => { setAccountId(''); setAccountName(''); acctSearch.reset(); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                  aria-label="Clear selection"
                >
                  ✕
                </button>
              </div>
            ) : (
              <>
                <Input
                  id="contact-account"
                  type="text"
                  value={acctSearch.search}
                  onChange={(e) => acctSearch.setSearch(e.target.value)}
                  onFocus={() => { if (acctSearch.results.length > 0) acctSearch.setOpen(true); }}
                  placeholder="Search accounts..."
                  autoComplete="off"
                />
                {acctSearch.open && acctSearch.results.length > 0 && (
                  <div className="relative">
                    <div className="absolute left-0 right-0 top-0 z-50 mt-1 max-h-[200px] overflow-y-auto rounded-md border bg-popover shadow-md">
                      {acctSearch.results.map((a) => {
                        const details = [a.agency_id, a.city, a.district].filter(Boolean).join(', ');
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => {
                              const selected = acctSearch.selectAccount(a);
                              setAccountId(selected.id);
                              setAccountName(selected.name);
                            }}
                            className="block w-full border-b border-border/50 px-3 py-2.5 text-left text-sm hover:bg-accent"
                          >
                            <div className="font-medium">{a.display_name}</div>
                            {details && (
                              <div className="mt-0.5 text-xs text-muted-foreground">{details}</div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
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
