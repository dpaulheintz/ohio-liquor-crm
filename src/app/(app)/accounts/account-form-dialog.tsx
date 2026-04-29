'use client';

import { useState, useEffect } from 'react';
import { createAccount, updateAccount } from '@/app/actions/accounts';
import { createContact } from '@/app/actions/contacts';
import { createVisit } from '@/app/actions/visits';
import { Account, KPI_OPTIONS } from '@/lib/types';
import { nowESTDatetimeLocal } from '@/lib/date-utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

const DELIVERY_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
  const [type, setType] = useState<string>(account?.type || 'wholesale');
  const [status, setStatus] = useState<string>(account?.status || 'customer');
  const [deliveryDay, setDeliveryDay] = useState<string>(account?.delivery_day || '');
  const [loading, setLoading] = useState(false);
  const isEditing = !!account;

  // Optional contact fields (only for new accounts)
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactTitle, setContactTitle] = useState('');

  // Optional visit fields (only for new accounts)
  const [includeVisit, setIncludeVisit] = useState(false);
  const [visitNotes, setVisitNotes] = useState('');
  const [visitKpi, setVisitKpi] = useState('');
  const [visitDateTime, setVisitDateTime] = useState(nowESTDatetimeLocal());

  // Reset state when dialog opens
  useEffect(() => {
    if (open && !isEditing) {
      setContactName('');
      setContactPhone('');
      setContactEmail('');
      setContactTitle('');
      setIncludeVisit(false);
      setVisitNotes('');
      setVisitKpi('');
      setVisitDateTime(nowESTDatetimeLocal());
    }
  }, [open, isEditing]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    try {
      const formData = new FormData(e.currentTarget);
      formData.set('type', type);
      formData.set('status', status);
      formData.set('delivery_day', deliveryDay);

      if (isEditing) {
        await updateAccount(account.id, formData);
        toast.success('Account updated');
      } else {
        const newAccount = await createAccount(formData);

        // Create contact if a name was provided
        if (contactName.trim()) {
          await createContact({
            name: contactName.trim(),
            account_id: newAccount.id,
            phone: contactPhone || undefined,
            email: contactEmail || undefined,
            title_role: contactTitle || undefined,
          });
        }

        // Create visit if toggled on
        if (includeVisit) {
          await createVisit({
            accountId: newAccount.id,
            notes: visitNotes || undefined,
            kpi: visitKpi || undefined,
            visitedAt: new Date(visitDateTime).toISOString(),
          });
        }

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
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
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
            <Label htmlFor="display_name">
              {type === 'wholesale' ? 'Name *' : 'Display Name *'}
            </Label>
            <Input
              id="display_name"
              name="display_name"
              required
              defaultValue={account?.display_name}
              style={{ textTransform: 'capitalize' }}
            />
          </div>

          {type === 'agency' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="agency_id">Agency ID *</Label>
                <Input
                  id="agency_id"
                  name="agency_id"
                  required
                  defaultValue={account?.agency_id ?? ''}
                  placeholder="State-assigned ID"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Delivery Day</Label>
                  <Select value={deliveryDay} onValueChange={setDeliveryDay}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select day" />
                    </SelectTrigger>
                    <SelectContent>
                      {DELIVERY_DAYS.map((day) => (
                        <SelectItem key={day} value={day}>{day}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="warehouse">Warehouse</Label>
                  <Input
                    id="warehouse"
                    name="warehouse"
                    defaultValue={account?.warehouse ?? ''}
                    placeholder="e.g., GPT"
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

              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  name="phone"
                  defaultValue={account?.phone ?? ''}
                />
              </div>
            </>
          )}

          {type === 'wholesale' && (
            <>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="prospect">Prospect</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="permit_number">Permit Number</Label>
                <Input
                  id="permit_number"
                  name="permit_number"
                  defaultValue={account?.permit_number ?? ''}
                  placeholder="State-assigned permit"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="linked_agency_name">Agency Name</Label>
                <Input
                  id="linked_agency_name"
                  name="linked_agency_name"
                  defaultValue={account?.linked_agency_name ?? ''}
                  placeholder="Parent agency name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="linked_agency_id">Agency ID</Label>
                <Input
                  id="linked_agency_id"
                  name="linked_agency_id"
                  defaultValue={account?.linked_agency_id ?? ''}
                  placeholder="Parent agency ID"
                />
              </div>

              {/* Optional fields for wholesale */}
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

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    name="phone"
                    defaultValue={account?.phone ?? ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="district">District</Label>
                  <Input
                    id="district"
                    name="district"
                    defaultValue={account?.district ?? ''}
                  />
                </div>
              </div>
            </>
          )}

          {/* Optional contact (new accounts only) */}
          {!isEditing && (
            <>
              <Separator />
              <p className="text-sm font-medium text-muted-foreground">Add a Contact (optional)</p>
              <div className="space-y-2">
                <Label htmlFor="contact_name">Contact Name</Label>
                <Input
                  id="contact_name"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Full name"
                  style={{ textTransform: 'capitalize' }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="contact_phone">Phone</Label>
                  <Input
                    id="contact_phone"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    type="tel"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact_email">Email</Label>
                  <Input
                    id="contact_email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    type="email"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact_title_role">Title / Role</Label>
                <Input
                  id="contact_title_role"
                  value={contactTitle}
                  onChange={(e) => setContactTitle(e.target.value)}
                  placeholder="e.g., Store Manager"
                />
              </div>

              <Separator />
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="include_visit"
                  checked={includeVisit}
                  onChange={(e) => setIncludeVisit(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <Label htmlFor="include_visit" className="text-sm font-medium text-muted-foreground cursor-pointer">
                  Log a visit too? (optional)
                </Label>
              </div>

              {includeVisit && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="visit_notes">Visit Notes</Label>
                    <Textarea
                      id="visit_notes"
                      value={visitNotes}
                      onChange={(e) => setVisitNotes(e.target.value)}
                      placeholder="Visit notes..."
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>KPI</Label>
                    <Select value={visitKpi} onValueChange={setVisitKpi}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select KPI (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {KPI_OPTIONS.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="visit_datetime">Date & Time (EST)</Label>
                    <Input
                      id="visit_datetime"
                      type="datetime-local"
                      value={visitDateTime}
                      onChange={(e) => setVisitDateTime(e.target.value)}
                    />
                  </div>
                </div>
              )}
            </>
          )}

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
