'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createVisit } from '@/app/actions/visits';
import { createClient } from '@/lib/supabase/client';
import imageCompression from 'browser-image-compression';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AccountCombobox } from '@/components/account-combobox';
import { KPI_OPTIONS } from '@/lib/types';
import { ArrowLeft, Camera, X } from 'lucide-react';
import { toast } from 'sonner';
import { nowESTDatetimeLocal } from '@/lib/date-utils';

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

  // Load preset account name via server action (avoids RLS issues)
  useEffect(() => {
    if (presetAccountId) {
      import('@/app/actions/accounts').then(({ getAccount }) =>
        getAccount(presetAccountId).then((data) => {
          if (data) setAccountName(data.display_name);
        }).catch(() => {})
      );
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
    if (!accountId) {
      toast.error('Please select an account');
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();

      // Upload and compress photos
      const photoUrls: { url: string; caption?: string; sort_order: number }[] =
        [];

      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];

        // Compress
        const compressed = await imageCompression(photo.file, {
          maxSizeMB: 0.8,
          maxWidthOrHeight: 1920,
          useWebWorker: true,
        });

        // Upload
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

      await createVisit({
        accountId,
        notes: notes || undefined,
        kpi: kpi || undefined,
        visitedAt: new Date(visitedAt).toISOString(),
        photoUrls: photoUrls.length > 0 ? photoUrls : undefined,
      });

      toast.success('Visit logged');
      router.push(presetAccountId ? `/accounts/${presetAccountId}` : '/');
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
            {/* Account */}
            <div className="space-y-1.5">
              <Label>Account *</Label>
              {presetAccountId ? (
                <Input value={accountName} disabled />
              ) : (
                <AccountCombobox
                  accountId={accountId}
                  accountName={accountName}
                  onSelect={(id, name) => {
                    setAccountId(id);
                    setAccountName(name);
                  }}
                />
              )}
            </div>

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
