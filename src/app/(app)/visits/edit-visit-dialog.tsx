'use client';

import { useState, useEffect } from 'react';
import { updateVisit } from '@/app/actions/visits';
import { getReps } from '@/app/actions/accounts';
import { createClient } from '@/lib/supabase/client';
import imageCompression from 'browser-image-compression';
import { useUser } from '@/hooks/useUser';
import { VisitLog, VisitPhoto, VisitKpi, KPI_OPTIONS } from '@/lib/types';
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
import { Camera, ImageIcon, X, Plus, Phone, MapPin } from 'lucide-react';
import { toast } from 'sonner';

interface EditVisitDialogProps {
  visit: VisitLog | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

function toDatetimeLocal(isoString: string): string {
  const d   = new Date(isoString);
  const est = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const y   = est.getFullYear();
  const m   = String(est.getMonth() + 1).padStart(2, '0');
  const day = String(est.getDate()).padStart(2, '0');
  const h   = String(est.getHours()).padStart(2, '0');
  const min = String(est.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}`;
}

interface NewPhoto { file: File; preview: string; caption: string; }
interface NewKpi   { type: string; quantity: number; }

const MAX_PHOTOS = 5;

// KPI colour map for badges
const KPI_COLORS: Record<string, string> = {
  Display: '#C8102E',
  Menu:    '#60a5fa',
  Feature: '#34d399',
  Event:   '#f472b6',
};

export function EditVisitDialog({ visit, open, onOpenChange, onSuccess }: EditVisitDialogProps) {
  const { profile, isAdmin } = useUser();

  const [notes, setNotes]         = useState('');
  const [visitedAt, setVisitedAt] = useState('');
  const [repId, setRepId]         = useState('');
  const [loading, setLoading]     = useState(false);

  // Photo state
  const [existingPhotos, setExistingPhotos]   = useState<VisitPhoto[]>([]);
  const [removePhotoIds, setRemovePhotoIds]   = useState<string[]>([]);
  const [newPhotos, setNewPhotos]             = useState<NewPhoto[]>([]);

  // KPI state
  const [existingKpis, setExistingKpis]       = useState<VisitKpi[]>([]);
  const [removeKpiIds, setRemoveKpiIds]       = useState<string[]>([]);
  const [newKpis, setNewKpis]                 = useState<NewKpi[]>([]);

  const [reps, setReps] = useState<Array<{ id: string; full_name: string | null; email: string }>>([]);

  useEffect(() => {
    if (isAdmin) getReps().then(setReps);
  }, [isAdmin]);

  useEffect(() => {
    if (visit && open) {
      setNotes(visit.notes || '');
      setVisitedAt(toDatetimeLocal(visit.visited_at));
      setRepId(visit.rep_id);
      setExistingPhotos(
        (visit.visit_photos ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)
      );
      setRemovePhotoIds([]);
      setNewPhotos([]);
      setExistingKpis(
        (visit.visit_kpis ?? []).slice().sort((a, b) => a.created_at?.localeCompare(b.created_at ?? '') ?? 0)
      );
      setRemoveKpiIds([]);
      setNewKpis([]);
    }
  }, [visit, open]);

  const canEdit    = !!profile && !!visit && (isAdmin || visit.rep_id === profile.id);
  const isPhone    = visit?.visit_type === 'phone_call';

  const currentPhotoCount = existingPhotos.length - removePhotoIds.length + newPhotos.length;
  const canAddMorePhotos  = currentPhotoCount < MAX_PHOTOS;

  // ── Photo handlers ──────────────────────────────────────────────────────────
  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files     = e.target.files;
    if (!files) return;
    const remaining = MAX_PHOTOS - currentPhotoCount;
    const toAdd     = Array.from(files).slice(0, remaining);
    setNewPhotos((prev) => [...prev, ...toAdd.map((file) => ({
      file, preview: URL.createObjectURL(file), caption: '',
    }))]);
    e.target.value = '';
  }

  function removeNewPhoto(idx: number) {
    setNewPhotos((prev) => { const next = [...prev]; URL.revokeObjectURL(next[idx].preview); next.splice(idx, 1); return next; });
  }

  function toggleRemoveExisting(id: string) {
    setRemovePhotoIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  // ── KPI handlers ────────────────────────────────────────────────────────────
  function addNewKpi() {
    setNewKpis((prev) => [...prev, { type: '', quantity: 1 }]);
  }

  function removeNewKpi(idx: number) {
    setNewKpis((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateNewKpiType(idx: number, type: string) {
    setNewKpis((prev) => prev.map((k, i) => i === idx ? { ...k, type } : k));
  }

  function updateNewKpiQty(idx: number, qty: number) {
    setNewKpis((prev) => prev.map((k, i) => i === idx ? { ...k, quantity: Math.max(1, Math.min(99, qty || 1)) } : k));
  }

  function toggleRemoveKpi(id: string) {
    setRemoveKpiIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!visit || !canEdit) return;

    const validNewKpis = newKpis.filter((k) => k.type);
    if (newKpis.length > 0 && validNewKpis.length < newKpis.length) {
      toast.error('Please select a KPI type for each entry'); return;
    }

    setLoading(true);
    try {
      // Upload new photos
      let addPhotos: { url: string; caption?: string; sort_order: number }[] | undefined;
      if (!isPhone && newPhotos.length > 0) {
        try {
          const supabase  = createClient();
          const uploaded: typeof addPhotos = [];
          const baseOrder = existingPhotos.length;
          for (let i = 0; i < newPhotos.length; i++) {
            const p          = newPhotos[i];
            const compressed = await imageCompression(p.file, { maxSizeMB: 0.8, maxWidthOrHeight: 1920, useWebWorker: true });
            const fileName   = `${Date.now()}-${i}-${compressed.name}`;
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('visit-photos').upload(fileName, compressed, { cacheControl: '3600', upsert: false });
            if (uploadError) throw uploadError;
            const { data: { publicUrl } } = supabase.storage.from('visit-photos').getPublicUrl(uploadData.path);
            uploaded!.push({ url: publicUrl, caption: p.caption || undefined, sort_order: baseOrder + i });
          }
          addPhotos = uploaded;
        } catch {
          toast.warning('Photos could not be uploaded — other changes will still be saved');
        }
      }

      await updateVisit(visit.id, {
        notes:          notes || undefined,
        visitedAt:      new Date(visitedAt).toISOString(),
        repId:          isAdmin && repId !== visit.rep_id ? repId : undefined,
        addKpis:        !isPhone && validNewKpis.length > 0 ? validNewKpis : undefined,
        removeKpiIds:   removeKpiIds.length > 0 ? removeKpiIds : undefined,
        addPhotos,
        removePhotoIds: removePhotoIds.length > 0 ? removePhotoIds : undefined,
      });

      toast.success('Visit updated');
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      void err;
      toast.error('Failed to update visit');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isPhone ? <Phone className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
            Edit {isPhone ? 'Phone Call' : 'Visit'}
          </DialogTitle>
        </DialogHeader>

        {!canEdit ? (
          <p className="text-sm text-muted-foreground py-4">
            You don&apos;t have permission to edit this visit.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="visit_notes">Notes</Label>
              <Textarea id="visit_notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Visit notes..." rows={3} />
            </div>

            {/* KPIs (in-person only) */}
            {!isPhone && (
              <div className="space-y-2">
                <Label>KPIs</Label>

                {/* Existing KPIs */}
                {existingKpis.length === 0 && newKpis.length === 0 && (
                  <p className="text-xs text-muted-foreground">No KPIs logged for this visit.</p>
                )}
                {existingKpis.map((k) => {
                  const marked = removeKpiIds.includes(k.id);
                  const color  = KPI_COLORS[k.kpi_type] ?? '#888';
                  return (
                    <div key={k.id} className={`flex items-center gap-2 rounded-md border p-2 transition-opacity ${marked ? 'opacity-40' : ''}`}>
                      <span
                        className="flex-1 inline-flex items-center gap-1.5 text-sm font-medium"
                        style={{ color }}
                      >
                        {k.kpi_type}
                        {k.kpi_quantity > 1 && <span className="text-xs text-muted-foreground">×{k.kpi_quantity}</span>}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleRemoveKpi(k.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        title={marked ? 'Undo remove' : 'Remove KPI'}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}

                {/* New KPIs being added */}
                {newKpis.map((k, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border border-primary/30 p-2">
                    <Select value={k.type} onValueChange={(v) => updateNewKpiType(i, v)}>
                      <SelectTrigger className="flex-1 h-8">
                        <SelectValue placeholder="KPI type" />
                      </SelectTrigger>
                      <SelectContent>
                        {KPI_OPTIONS.map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">×</span>
                      <Input
                        type="number" min={1} max={99}
                        value={k.quantity}
                        onChange={(e) => updateNewKpiQty(i, parseInt(e.target.value))}
                        className="w-16 h-8 text-center"
                      />
                    </div>
                    <button type="button" onClick={() => removeNewKpi(i)} className="text-muted-foreground hover:text-destructive">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}

                <button type="button" onClick={addNewKpi} className="flex items-center gap-1 text-sm text-primary hover:underline">
                  <Plus className="h-3.5 w-3.5" /> Add KPI
                </button>
              </div>
            )}

            {/* Date & Time */}
            <div className="space-y-2">
              <Label>Date &amp; Time (EST)</Label>
              <DateTimePicker idPrefix="edit-visit" value={visitedAt} onChange={setVisitedAt} />
            </div>

            {/* Rep (admin only) */}
            {isAdmin && (
              <div className="space-y-2">
                <Label>Assigned Rep</Label>
                <Select value={repId} onValueChange={setRepId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select rep" />
                  </SelectTrigger>
                  <SelectContent>
                    {reps.map((r) => (
                      <SelectItem key={r.id} value={r.id}>{r.full_name || r.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Photos (in-person only) */}
            {!isPhone && (
              <div className="space-y-2">
                <Label>Photos ({currentPhotoCount}/{MAX_PHOTOS})</Label>
                <div className="flex flex-wrap gap-2">
                  {existingPhotos.map((p) => {
                    const marked = removePhotoIds.includes(p.id);
                    return (
                      <div key={p.id} className="relative">
                        <img src={p.photo_url} alt={p.caption || 'Visit photo'} className={`h-20 w-20 rounded-md object-cover ${marked ? 'opacity-30' : ''}`} />
                        <button type="button" onClick={() => toggleRemoveExisting(p.id)} className="absolute -top-1 -right-1 rounded-full bg-destructive p-0.5 text-white" title={marked ? 'Undo remove' : 'Remove'}>
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                  {newPhotos.map((p, i) => (
                    <div key={i} className="relative">
                      <img src={p.preview} alt={`New ${i + 1}`} className="h-20 w-20 rounded-md object-cover ring-2 ring-primary" />
                      <button type="button" onClick={() => removeNewPhoto(i)} className="absolute -top-1 -right-1 rounded-full bg-destructive p-0.5 text-white">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {canAddMorePhotos && (
                    <div className="flex flex-col gap-1.5">
                      <label className="flex h-9 w-20 cursor-pointer items-center justify-center gap-1 rounded-md border-2 border-dashed text-xs text-muted-foreground hover:bg-muted/50 transition-colors">
                        <Camera className="h-3.5 w-3.5" /> Camera
                        <input type="file" accept="image/*" capture="environment" onChange={handlePhotoSelect} className="hidden" />
                      </label>
                      <label className="flex h-9 w-20 cursor-pointer items-center justify-center gap-1 rounded-md border-2 border-dashed text-xs text-muted-foreground hover:bg-muted/50 transition-colors">
                        <ImageIcon className="h-3.5 w-3.5" /> Library
                        <input type="file" accept="image/*" multiple onChange={handlePhotoSelect} className="hidden" />
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Update'}</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
