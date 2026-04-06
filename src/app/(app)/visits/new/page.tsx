'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createVisit } from '@/app/actions/visits';
import { createAccount } from '@/app/actions/accounts';
import { createContact } from '@/app/actions/contacts';
import { createClient } from '@/lib/supabase/client';
import imageCompression from 'browser-image-compression';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AccountCombobox } from '@/components/account-combobox';
import { KPI_OPTIONS } from '@/lib/types';
import { ArrowLeft, Camera, X, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { nowESTDatetimeLocal } from '@/lib/date-utils';

const DELIVERY_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

interface PhotoItem {
  file: File;
  preview: string;
  caption: string;
}

export default function NewVisitPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Loading...</div>}>
      <NewVisitForm />
    </Suspense>
  );
}

function NewVisitForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetAccountId = searchParams.get('account');

  const [accountId, setAccountId] = useState(presetAccountId ?? '');
  const [accountName, setAccountName] = useState('');

  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [notes, setNotes] = useState('');
  const [kpi, setKpi] = useState('');
  const [visitedAt, setVisitedAt] = useState(nowESTDatetimeLocal());
  const [loading, setLoading] = useState(false);

  // Inline new account state
  const [creatingNewAccount, setCreatingNewAccount] = useState(false);
  const [newAcctType, setNewAcctType] = useState<string>('agency');
  const [newAcctName, setNewAcctName] = useState('');
  const [newAcctAgencyId, setNewAcctAgencyId] = useState('');
  const [newAcctPermitNumber, setNewAcctPermitNumber] = useState('');
  const [newAcctDeliveryDay, setNewAcctDeliveryDay] = useState('');
  const [newAcctWarehouse, setNewAcctWarehouse] = useState('');
  const [newAcctAddress, setNewAcctAddress] = useState('');
  const [newAcctCity, setNewAcctCity] = useState('');
  const [newAcctZip, setNewAcctZip] = useState('');
  const [newAcctPhone, setNewAcctPhone] = useState('');
  const [newAcctDistrict, setNewAcctDistrict] = useState('');
  const [newAcctLinkedName, setNewAcctLinkedName] = useState('');
  const [newAcctLinkedId, setNewAcctLinkedId] = useState('');

  // Inline new contact state
  const [creatingNewContact, setCreatingNewContact] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactTitle, setNewContactTitle] = useState('');

  const [loadingAccount, setLoadingAccount] = useState(!!presetAccountId);

  // Load preset account name via server action (avoids RLS issues)
  useEffect(() => {
    if (presetAccountId) {
      setLoadingAccount(true);
      import('@/app/actions/accounts').then(({ getAccount }) =>
        getAccount(presetAccountId).then((data) => {
          if (data) setAccountName(data.display_name);
        }).catch(() => {})
      ).finally(() => setLoadingAccount(false));
    }
  }, [presetAccountId]);

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;

    const remaining = 5 - photos.length;
    const newFiles = Array.from(files).slice(0, remaining);

    const newPhotos = newFiles.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
      caption: '',
    }));

    setPhotos([...photos, ...newPhotos]);
    e.target.value = '';
  }

  function removePhoto(index: number) {
    const updated = [...photos];
    URL.revokeObjectURL(updated[index].preview);
    updated.splice(index, 1);
    setPhotos(updated);
  }

  function updateCaption(index: number, caption: string) {
    const updated = [...photos];
    updated[index].caption = caption.slice(0, 140);
    setPhotos(updated);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    let resolvedAccountId = accountId;

    // Validate: need either a selected account or a new account being created
    if (creatingNewAccount) {
      if (!newAcctName.trim()) {
        toast.error('Please enter a name for the new account');
        return;
      }
      if (newAcctType === 'agency' && !newAcctAgencyId.trim()) {
        toast.error('Agency ID is required for agency accounts');
        return;
      }
    } else if (!resolvedAccountId) {
      toast.error('Please select an account');
      return;
    }

    // Validate new contact if toggled
    if (creatingNewContact && !newContactName.trim()) {
      toast.error('Please enter a name for the new contact');
      return;
    }

    setLoading(true);
    try {
      // Step 1: Create account if needed
      if (creatingNewAccount) {
        const formData = new FormData();
        formData.set('type', newAcctType);
        formData.set('display_name', newAcctName);
        formData.set('delivery_day', newAcctDeliveryDay);
        if (newAcctAgencyId) formData.set('agency_id', newAcctAgencyId);
        if (newAcctPermitNumber) formData.set('permit_number', newAcctPermitNumber);
        if (newAcctWarehouse) formData.set('warehouse', newAcctWarehouse);
        if (newAcctAddress) formData.set('address', newAcctAddress);
        if (newAcctCity) formData.set('city', newAcctCity);
        if (newAcctZip) formData.set('zip', newAcctZip);
        if (newAcctPhone) formData.set('phone', newAcctPhone);
        if (newAcctDistrict) formData.set('district', newAcctDistrict);
        if (newAcctLinkedName) formData.set('linked_agency_name', newAcctLinkedName);
        if (newAcctLinkedId) formData.set('linked_agency_id', newAcctLinkedId);

        const newAccount = await createAccount(formData);
        resolvedAccountId = newAccount.id;
        toast.success('Account created');
      }

      // Step 2: Create contact if needed
      if (creatingNewContact && newContactName.trim()) {
        await createContact({
          name: newContactName.trim(),
          account_id: resolvedAccountId,
          phone: newContactPhone || undefined,
          email: newContactEmail || undefined,
          title_role: newContactTitle || undefined,
        });
        toast.success('Contact added');
      }

      // Step 3: Upload and compress photos
      const supabase = createClient();
      const photoUrls: { url: string; caption?: string; sort_order: number }[] = [];

      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];

        const compressed = await imageCompression(photo.file, {
          maxSizeMB: 0.8,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
        });

        const fileName = `${Date.now()}-${i}-${compressed.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('visit-photos')
          .upload(fileName, compressed, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from('visit-photos').getPublicUrl(uploadData.path);

        photoUrls.push({
          url: publicUrl,
          caption: photo.caption || undefined,
          sort_order: i,
        });
      }

      // Step 4: Create visit
      await createVisit({
        accountId: resolvedAccountId,
        notes: notes || undefined,
        kpi: kpi || undefined,
        visitedAt: new Date(visitedAt).toISOString(),
        photoUrls: photoUrls.length > 0 ? photoUrls : undefined,
      });

      toast.success('Visit logged');
      router.push(presetAccountId ? `/accounts/${presetAccountId}` : `/accounts/${resolvedAccountId}`);
    } catch (err) {
      console.error('Failed to log visit:', err);
      toast.error('Failed to log visit');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-lg mx-auto space-y-4">
      <Button variant="ghost" size="sm" onClick={() => router.back()}>
        <ArrowLeft className="mr-1 h-4 w-4" />
        Back
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Log Visit</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Account Selection */}
            <div className="relative space-y-1.5">
              <Label htmlFor="visit-account">Account *</Label>
              {presetAccountId ? (
                <Input
                  id="visit-account"
                  value={loadingAccount ? 'Loading account...' : accountName}
                  disabled
                  className={loadingAccount ? 'text-muted-foreground italic' : ''}
                />
              ) : creatingNewAccount ? (
                <Input
                  id="visit-account"
                  value={newAcctName}
                  disabled
                  placeholder="Fill in account details below"
                  className="text-muted-foreground"
                />
              ) : (
                <AccountCombobox
                  inputId="visit-account"
                  accountId={accountId}
                  accountName={accountName}
                  onSelect={(id, name) => {
                    setAccountId(id);
                    setAccountName(name);
                  }}
                />
              )}
            </div>

            {/* Toggle: Create New Account */}
            {!presetAccountId && (
              <button
                type="button"
                onClick={() => {
                  setCreatingNewAccount(!creatingNewAccount);
                  if (!creatingNewAccount) {
                    setAccountId('');
                    setAccountName('');
                  }
                }}
                className="text-sm text-primary flex items-center gap-1 hover:underline"
              >
                {creatingNewAccount ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Creating a new account?
              </button>
            )}

            {/* Inline New Account Fields */}
            {creatingNewAccount && (
              <div className="space-y-3 pl-3 border-l-2 border-primary/20">
                <div className="space-y-1.5">
                  <Label>Account Type</Label>
                  <Select value={newAcctType} onValueChange={setNewAcctType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agency">Agency (Liquor Store)</SelectItem>
                      <SelectItem value="wholesale">Wholesale (Bar/Restaurant)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>{newAcctType === 'wholesale' ? 'Name *' : 'Display Name *'}</Label>
                  <Input
                    value={newAcctName}
                    onChange={(e) => setNewAcctName(e.target.value)}
                    required
                  />
                </div>

                {newAcctType === 'agency' && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Agency ID *</Label>
                      <Input
                        value={newAcctAgencyId}
                        onChange={(e) => setNewAcctAgencyId(e.target.value)}
                        placeholder="State-assigned ID"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Delivery Day</Label>
                        <Select value={newAcctDeliveryDay} onValueChange={setNewAcctDeliveryDay}>
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
                      <div className="space-y-1.5">
                        <Label>Warehouse</Label>
                        <Input
                          value={newAcctWarehouse}
                          onChange={(e) => setNewAcctWarehouse(e.target.value)}
                          placeholder="e.g., GPT"
                        />
                      </div>
                    </div>
                  </>
                )}

                {newAcctType === 'wholesale' && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Permit Number</Label>
                      <Input
                        value={newAcctPermitNumber}
                        onChange={(e) => setNewAcctPermitNumber(e.target.value)}
                        placeholder="State-assigned permit"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Agency Name</Label>
                        <Input
                          value={newAcctLinkedName}
                          onChange={(e) => setNewAcctLinkedName(e.target.value)}
                          placeholder="Parent agency"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Agency ID</Label>
                        <Input
                          value={newAcctLinkedId}
                          onChange={(e) => setNewAcctLinkedId(e.target.value)}
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="space-y-1.5">
                  <Label>Address</Label>
                  <Input
                    value={newAcctAddress}
                    onChange={(e) => setNewAcctAddress(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>City</Label>
                    <Input
                      value={newAcctCity}
                      onChange={(e) => setNewAcctCity(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>ZIP</Label>
                    <Input
                      value={newAcctZip}
                      onChange={(e) => setNewAcctZip(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Phone</Label>
                    <Input
                      value={newAcctPhone}
                      onChange={(e) => setNewAcctPhone(e.target.value)}
                      type="tel"
                    />
                  </div>
                  {newAcctType === 'wholesale' && (
                    <div className="space-y-1.5">
                      <Label>District</Label>
                      <Input
                        value={newAcctDistrict}
                        onChange={(e) => setNewAcctDistrict(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Toggle: Add New Contact */}
            <button
              type="button"
              onClick={() => setCreatingNewContact(!creatingNewContact)}
              className="text-sm text-primary flex items-center gap-1 hover:underline"
            >
              {creatingNewContact ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              Adding a new contact?
            </button>

            {/* Inline New Contact Fields */}
            {creatingNewContact && (
              <div className="space-y-3 pl-3 border-l-2 border-primary/20">
                <div className="space-y-1.5">
                  <Label>Contact Name *</Label>
                  <Input
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    placeholder="Full name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Phone</Label>
                    <Input
                      value={newContactPhone}
                      onChange={(e) => setNewContactPhone(e.target.value)}
                      type="tel"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email</Label>
                    <Input
                      value={newContactEmail}
                      onChange={(e) => setNewContactEmail(e.target.value)}
                      type="email"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Title / Role</Label>
                  <Input
                    value={newContactTitle}
                    onChange={(e) => setNewContactTitle(e.target.value)}
                    placeholder="e.g., Store Manager"
                  />
                </div>
              </div>
            )}

            <Separator />

            {/* Photos */}
            <div className="space-y-1.5">
              <Label>Photos ({photos.length}/5)</Label>
              <div className="flex flex-wrap gap-2">
                {photos.map((photo, i) => (
                  <div key={i} className="relative">
                    <img
                      src={photo.preview}
                      alt={`Photo ${i + 1}`}
                      className="h-20 w-20 rounded-md object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      className="absolute -top-1 -right-1 rounded-full bg-destructive p-0.5 text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <Input
                      value={photo.caption}
                      onChange={(e) => updateCaption(i, e.target.value)}
                      placeholder="Caption"
                      className="mt-1 h-7 text-xs w-20"
                      maxLength={140}
                    />
                  </div>
                ))}
                {photos.length < 5 && (
                  <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-md border-2 border-dashed hover:bg-muted/50 transition-colors">
                    <Camera className="h-6 w-6 text-muted-foreground" />
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      onChange={handlePhotoSelect}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Visit notes..."
                rows={3}
              />
            </div>

            {/* KPI */}
            <div className="space-y-1.5">
              <Label>KPI</Label>
              <Select value={kpi} onValueChange={setKpi}>
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

            {/* Date/Time */}
            <div className="space-y-1.5">
              <Label htmlFor="visited_at">Date & Time (EST)</Label>
              <Input
                id="visited_at"
                type="datetime-local"
                value={visitedAt}
                onChange={(e) => setVisitedAt(e.target.value)}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Saving...' : 'Log Visit'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
