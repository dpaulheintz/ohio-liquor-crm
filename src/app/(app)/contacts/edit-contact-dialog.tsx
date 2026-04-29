'use client';

import { useState, useEffect } from 'react';
import { updateContact } from '@/app/actions/contacts';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Contact } from '@/lib/types';
import { toast } from 'sonner';

interface EditContactDialogProps {
  contact: Contact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EditContactDialog({
  contact,
  open,
  onOpenChange,
  onSuccess,
}: EditContactDialogProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [titleRole, setTitleRole] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && contact) {
      setName(contact.name);
      setPhone(contact.phone ?? '');
      setEmail(contact.email ?? '');
      setTitleRole(contact.title_role ?? '');
    }
  }, [open, contact]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!contact || !name) return;

    setLoading(true);
    try {
      await updateContact(contact.id, {
        name,
        phone: phone || undefined,
        email: email || undefined,
        title_role: titleRole || undefined,
      });
      toast.success('Contact updated');
      onOpenChange(false);
      onSuccess();
    } catch {
      toast.error('Failed to update contact');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Contact</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="edit-name">Name *</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{ textTransform: 'capitalize' }}
            />
          </div>

          {contact?.account && (
            <div className="space-y-1.5">
              <Label>Account</Label>
              <Input
                value={contact.account?.display_name ?? ''}
                disabled
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="edit-phone">Phone</Label>
            <Input
              id="edit-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-title">Title / Role</Label>
            <Input
              id="edit-title"
              value={titleRole}
              onChange={(e) => setTitleRole(e.target.value)}
              placeholder="e.g., Store Manager"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name}>
              {loading ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
