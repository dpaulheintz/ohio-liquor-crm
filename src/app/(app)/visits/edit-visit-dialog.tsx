'use client';

import { useState, useEffect } from 'react';
import { updateVisit } from '@/app/actions/visits';
import { getReps } from '@/app/actions/accounts';
import { createClient } from '@/lib/supabase/client';
import imageCompression from 'browser-image-compression';
import { useUser } from '@/hooks/useUser';
import { VisitLog, VisitPhoto, KPI_OPTIONS } from '@/lib/types';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DateTimePicker } from '@/components/date-time-picker';
import { Camera, ImageIcon, X } from 'lucide-react';
import { toast } from 'sonner';

interface EditVisitDialogProps {
  visit: VisitLog | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

function toDatetimeLocal(isoString: string): string {
  const d = new Date(isoString);
  const est = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const y = est.getFullYear();
  const m = String(est.getMonth() + 1).padStart(2, '0');
  const day = String(est.getDate()).padStart(2, '0');
  const h = String(est.getHours()).padStart(2, '0');
  const min = String(est.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}`;
}

interface NewPhoto {
  file: File;
  preview: string;
  caption: string;
}

const MAX_PHOTOS = 5;

export function EditVisitDialog({ visit, open, onOpenChange, onSuccess }: EditVisitDialogProps) {
  const { profile, isAdmin } = useUser();

  const [notes, setNotes] = useState('');
  const [kpi, setKpi] = useState('');
  const [kpiQuantity, setKpiQuantity] = useState<number>(1);
  const [visitedAt, setVisitedAt] = useState('');
  const [repId, setRepId] = useState('');
  const [loading, setLoading] = useState(false);

  const [existingPhotos, setExistingPhotos] = useState<VisitPhoto[]>([]);
  const [removePhotoIds, setRemovePhotoIds] = useState<string[]>([]);
  const [newPhotos, setNewPhotos] = useState<NewPhoto[]>([]);

  const [reps, setReps] = useState<Array<{ id: string; full_name: string | null; email: string }>>([]);

  useEffect(() => {
    if (isAdmin) getReps().then(setReps);
  }, [isAdmin]);

  useEffect(() => {
    if (visit && open) {
      setNotes(visit.notes || '');
      setKpi(visit.kpi || '');
      setKpiQuantity(visit.kpi_quantity || 1);
      setVisitedAt(toDatetimeLocal(visit.visited_at));
      setRepId(visit.rep_id);
      setExistingPhotos(
        (visit.visit_photos ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)
      );
      setRemovePhotoIds([]);
      setNewPhotos([]);
    }
  }, [visit, open]);

  // Permission: reps can edit only their own visits; admins can edit any
  const canEdit =
    !!profile && !!visit && (isAdmin || visit.rep_id === profile.id);

  const currentPhotoCount =
    existingPhotos.length - removePhotoIds.length + newPhotos.length;
  const canAddMorePhotos = currentPhotoCount < MAX_PHOTOS;

  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    const remaining = MAX_PHOTOS - currentPhotoCount;
    const toAdd = Array.from(files).slice(0, remaining);
    setNewPhotos((prev) => [
      ...prev,
      ...toAdd.map((file) => ({
        file,
        preview: URL.createObjectURL(file),
        caption: '',
      })),
    ]);
    e.target.value = '';
  }

  function removeNewPhoto(idx: number) {
    setNewPhotos((prev) => {
      const next = [...prev];
      URL.revokeObjectURL(next[idx].preview);
      next.splice(idx, 1);
      return next;
    });
  }

  function toggleRemoveExisting(id: string) {
    setRemovePhotoIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!visit || !canEdit) return;
    setLoading(true);

    try {
      // Upload any new photos first
      let addPhotos: { url: string; caption?: string; sort_order: number }[] | undefined;
      if (newPhotos.length > 0) {
        try {
          const supabase = createClient();
          const uploaded: { url: string; caption?: string; sort_order: number }[] = [];
          const baseOrder = existingPhotos.length;
          for (let i = 0; i < newPhotos.length; i++) {
            const p = newPhotos[i];
            const compressed = await imageCompression(p.file, {
              maxSizeMB: 0.8,
              maxWidthOrHeight: 1920,
              useWebWorker: true,
            });
            const fileName = `${Date.now()}-${i}-${compressed.name}`;
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('visit-photos')
              .upload(fileName, compressed, { cacheControl: '3600', upsert: false });
            if (uploadError) throw uploadError;
            const { data: { publicUrl } } = supabase.storage
              .from('visit-photos')
              .getPublicUrl(uploadData.path);
            uploaded.push({
              url: publicUrl,
              caption: p.caption || undefined,
              sort_order: baseOrder + i,
            });
          }
          addPhotos = uploaded;
        } catch (err) {
          console.error('Photo upload failed:', err);
          toast.warning('Photos could not be uploaded — other changes will still be saved');
        }
      }

      await updateVisit(visit.id, {
        notes: notes || undefined,
        kpi: kpi && kpi !== 'none' ? kpi : undefined,
        kpiQuantity: kpi && kpi !== 'none' ? kpiQuantity : undefined,
        visitedAt: new Date(visitedAt).toISOString(),
        repId: isAdmin && repId !== visit.rep_id ? repId : undefined,
        addPhotos,
        removePhotoIds: removePhotoIds.length > 0 ? removePhotoIds : undefined,
      });
      toast.success('Visit updated');
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error('Failed to update visit');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Visit</DialogTitle>
        </DialogHeader>

        {!canEdit ? (
          <p className="text-sm text-muted-foreground py-4">
            You don&apos;t have permission to edit this visit.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="visit_notes">Notes</Label>
              <Textarea
                id="visit_notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Visit notes..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>KPI</Label>
              <Select value={kpi} onValueChange={(v) => { setKpi(v); setKpiQuantity(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select KPI (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {KPI_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {kpi && kpi !== 'none' && (
                <div className="pt-1 space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    If more than 1, please denote amount
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={99}
                    value={kpiQuantity}
                    onChange={(e) => setKpiQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-24"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Date &amp; Time (EST)</Label>
              <DateTimePicker
                idPrefix="edit-visit"
                value={visitedAt}
                onChange={setVisitedAt}
              />
            </div>

            {isAdmin && (
              <div className="space-y-2">
                <Label>Assigned Rep</Label>
                <Select value={repId} onValueChange={setRepId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select rep" />
                  </SelectTrigger>
                  <SelectContent>
                    {reps.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.full_name || r.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Photos ({currentPhotoCount}/{MAX_PHOTOS})</Label>
              <div className="flex flex-wrap gap-2">
                {existingPhotos.map((p) => {
                  const marked = removePhotoIds.includes(p.id);
                  return (
                    <div key={p.id} className="relative">
                      <img
                        src={p.photo_url}
                        alt={p.caption || 'Visit photo'}
                        className={`h-20 w-20 rounded-md object-cover ${marked ? 'opacity-30' : ''}`}
                      />
                      <button
                        type="button"
                        onClick={() => toggleRemoveExisting(p.id)}
                        className="absolute -top-1 -right-1 rounded-full bg-destructive p-0.5 text-white"
                        title={marked ? 'Undo remove' : 'Remove'}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
                {newPhotos.map((p, i) => (
                  <div key={i} className="relative">
                    <img
                      src={p.preview}
                      alt={`New ${i + 1}`}
                      className="h-20 w-20 rounded-md object-cover ring-2 ring-primary"
                    />
                    <button
                      type="button"
                      onClick={() => removeNewPhoto(i)}
                      className="absolute -top-1 -right-1 rounded-full bg-destructive p-0.5 text-white"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {canAddMorePhotos && (
                  <div className="flex flex-col gap-1.5">
                    <label className="flex h-9 w-20 cursor-pointer items-center justify-center gap-1 rounded-md border-2 border-dashed text-xs text-muted-foreground hover:bg-muted/50 transition-colors">
                      <Camera className="h-3.5 w-3.5" /> Camera
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handlePhotoSelect}
                        className="hidden"
                      />
                    </label>
                    <label className="flex h-9 w-20 cursor-pointer items-center justify-center gap-1 rounded-md border-2 border-dashed text-xs text-muted-foreground hover:bg-muted/50 transition-colors">
                      <ImageIcon className="h-3.5 w-3.5" /> Library
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handlePhotoSelect}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? 'Saving...' : 'Update'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
