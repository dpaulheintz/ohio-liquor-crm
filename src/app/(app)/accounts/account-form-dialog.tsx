'use client';

import { useState } from 'react';
import { createAccount, updateAccount } from '@/app/actions/accounts';
import { Account } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

interface AccountFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  account?: Account;
}

export function AccountFormDialog({
  open,
  onOpenChange,
  onSuccess,
  account,
}: AccountFormDialogProps) {
  const [type, setType] = useState<string>(account?.type || 'agency');
  const [loading, setLoading] = useState(false);
  const isEditing = !!account;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    try {
      const formData = new FormData(e.currentTarget);
      formData.set('type', type);

      if (isEditing) {
        await updateAccount(account.id, formData);
        toast.success('Account updated');
      } else {
        await createAccount(formData);
        toast.success('Account created');
      }
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error(isEditing ? 'Failed to update account' : 'Failed to create account');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Account' : 'New Account'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Account Type</Label>
            <Select value={type} onValueChange={setType} disabled={isEditing}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="agency">Agency (Liquor Store)</SelectItem>
                <SelectItem value="wholesale">Wholesale (Bar/Restaurant)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="display_name">Display Name *</Label>
            <Input
              id="display_name"
              name="display_name"
              required
              defaultValue={account?.display_name}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="legal_name">Legal Name</Label>
            <Input
              id="legal_name"
              name="legal_name"
              defaultValue={account?.legal_name ?? ''}
            />
          </div>

          {type === 'agency' && (
            <div className="space-y-2">
              <Label htmlFor="agency_id">Agency ID</Label>
              <Input
                id="agency_id"
                name="agency_id"
                defaultValue={account?.agency_id ?? ''}
                placeholder="State-assigned ID"
              />
            </div>
          )}

          {type === 'wholesale' && (
            <div className="space-y-2">
              <Label htmlFor="permit_number">Permit Number</Label>
              <Input
                id="permit_number"
                name="permit_number"
                defaultValue={account?.permit_number ?? ''}
                placeholder="State-assigned permit"
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="district">District</Label>
              <Input
                id="district"
                name="district"
                defaultValue={account?.district ?? ''}
                placeholder="e.g., GPT"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                name="phone"
                defaultValue={account?.phone ?? ''}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              name="address"
              defaultValue={account?.address ?? ''}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                name="city"
                defaultValue={account?.city ?? ''}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zip">ZIP</Label>
              <Input
                id="zip"
                name="zip"
                defaultValue={account?.zip ?? ''}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : isEditing ? 'Update' : 'Create'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
