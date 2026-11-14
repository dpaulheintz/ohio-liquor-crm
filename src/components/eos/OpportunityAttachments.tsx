'use client';

// Photos and files on an EOS opportunity. Used in the Opportunities edit dialog and in the meeting
// runner's discussion panel. Everything runs as the signed-in user, so RLS decides who can see,
// upload and delete (EOS users; delete = uploader or EOS admin). Files are only served via signed URLs.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Loader2, Paperclip, Presentation, Trash2, Upload, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { isEosAdmin } from '@/lib/eos-auth';
import {
  ATTACHMENT_ACCEPT, ATTACHMENT_BUCKET, MAX_ATTACHMENT_BYTES, attachmentType, fileLabel, fmtBytes, isHeic, isImageMime,
  storagePathFor, type OpportunityAttachment,
} from '@/lib/eos/attachments';
import { cn } from '@/lib/utils';

type Item = OpportunityAttachment & { url?: string };

/** HEIC/HEIF → JPEG. Safari (iPhone/Mac) decodes HEIC natively; elsewhere fall back to heic2any (loaded on demand). */
async function heicToJpeg(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    c.getContext('2d')!.drawImage(bmp, 0, 0);
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.9));
    if (blob) return blob;
  } catch { /* this browser can't decode HEIC */ }
  const heic2any = (await import('heic2any')).default;
  const out = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
  return Array.isArray(out) ? out[0] : out;
}

export function OpportunityAttachments({ opportunityId, onCountChange, className }: {
  opportunityId: string;
  onCountChange?: (n: number) => void;
  className?: string;
}) {
  const supabase = useRef(createClient()).current;
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string[]>([]); // file names uploading
  const [error, setError] = useState('');
  const [me, setMe] = useState<{ id: string; admin: boolean } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const countRef = useRef(onCountChange);
  useEffect(() => { countRef.current = onCountChange; }, [onCountChange]);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase
      .from('eos_opportunity_attachments').select('*').eq('opportunity_id', opportunityId).order('created_at');
    if (e) { setError('Could not load attachments.'); setLoading(false); return; }
    const rows = (data ?? []) as OpportunityAttachment[];
    // signed URLs only (private bucket): photos inline, PDFs open in the browser, other files download
    const withUrls: Item[] = await Promise.all(rows.map(async (r) => {
      const opts = isImageMime(r.mime_type) || r.mime_type === 'application/pdf' ? undefined : { download: r.file_name };
      const { data: s } = await supabase.storage.from(ATTACHMENT_BUCKET).createSignedUrl(r.storage_path, 60 * 60, opts);
      return { ...r, url: s?.signedUrl };
    }));
    setItems(withUrls); setLoading(false);
    countRef.current?.(withUrls.length);
  }, [supabase, opportunityId]);

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data }) => { if (alive && data.user) setMe({ id: data.user.id, admin: isEosAdmin(data.user.email) }); });
    load();
    // live: someone else adds or removes a file during a meeting
    const ch = supabase
      .channel(`eos-att-${opportunityId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'eos_opportunity_attachments', filter: `opportunity_id=eq.${opportunityId}` }, () => load())
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [supabase, opportunityId, load]);

  async function upload(list: FileList | File[]) {
    setError('');
    const files = [...list];
    for (const f of files) {
      const t = attachmentType(f);
      if (!t) { setError(`${f.name}: only photos (JPG, PNG, HEIC) and PDF, Word, Excel, PowerPoint or CSV files.`); continue; }
      setBusy((b) => [...b, f.name]);
      try {
        let body: Blob = f, name = f.name || `photo-${Date.now()}.jpg`;
        if (isHeic(f)) { body = await heicToJpeg(f); name = name.replace(/\.(heic|heif)$/i, '') + '.jpg'; }
        if (!/\.[a-z0-9]+$/i.test(name)) name += t.mime === 'image/png' ? '.png' : '.jpg';
        if (body.size > MAX_ATTACHMENT_BYTES) throw new Error(`${name} is ${fmtBytes(body.size)}. The limit is 25 MB.`);
        const path = storagePathFor(opportunityId, name);
        const { error: upErr } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, body, { contentType: t.mime, upsert: false });
        if (upErr) throw new Error(`${name}: ${upErr.message}`);
        const { error: rowErr } = await supabase.from('eos_opportunity_attachments').insert({
          opportunity_id: opportunityId, storage_path: path, file_name: name.slice(0, 200), mime_type: t.mime, size_bytes: body.size,
        });
        if (rowErr) {
          await supabase.storage.from(ATTACHMENT_BUCKET).remove([path]);
          throw new Error(`${name}: ${rowErr.message}`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : `Could not upload ${f.name}.`);
      } finally {
        setBusy((b) => { const i = b.indexOf(f.name); return i < 0 ? b : [...b.slice(0, i), ...b.slice(i + 1)]; });
      }
    }
    await load();
  }

  async function remove(item: Item) {
    setError('');
    // row first (RLS: uploader or EOS admin), then the file
    const { error: e, count } = await supabase.from('eos_opportunity_attachments').delete({ count: 'exact' }).eq('id', item.id);
    if (e || !count) { setError('Only the person who added this, or an admin, can delete it.'); setConfirmId(null); return; }
    const { error: rmErr } = await supabase.storage.from(ATTACHMENT_BUCKET).remove([item.storage_path]);
    if (rmErr) setError(`Deleted, but the file could not be removed from storage: ${rmErr.message}`);
    setConfirmId(null);
    await load();
  }

  const photos = items.filter((i) => isImageMime(i.mime_type));
  const files = items.filter((i) => !isImageMime(i.mime_type));
  const canDelete = (i: Item) => !!me && (me.admin || i.uploaded_by === me.id);

  const deleteControl = (i: Item, onDark = false) => confirmId === i.id ? (
    <span className="flex items-center gap-1">
      <button type="button" onClick={() => remove(i)} className="rounded bg-red-600 px-2 py-1 text-[11px] font-semibold text-white">Delete</button>
      <button type="button" onClick={() => setConfirmId(null)} className={cn('rounded px-2 py-1 text-[11px] font-medium', onDark ? 'bg-white/80 text-gray-800' : 'bg-gray-100 text-gray-600')}>Cancel</button>
    </span>
  ) : canDelete(i) ? (
    <button type="button" onClick={() => setConfirmId(i.id)} aria-label={`Delete ${i.file_name}`}
      className={cn('rounded p-1.5', onDark ? 'bg-black/55 text-white hover:bg-black/75' : 'text-gray-400 hover:bg-gray-100 hover:text-red-600')}>
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  ) : null;

  return (
    <div
      className={cn('space-y-3', className)}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); }}
      data-attachments={opportunityId}
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
          <Paperclip className="h-3.5 w-3.5" />Attachments{items.length ? ` (${items.length})` : ''}
        </h4>
        <div className="flex gap-2">
          <button type="button" onClick={() => camRef.current?.click()} className="flex min-h-10 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 md:hidden">
            <Camera className="h-4 w-4" />Take photo
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className="flex min-h-10 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50">
            <Upload className="h-4 w-4" />Choose file
          </button>
        </div>
        <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ''; }} />
        <input ref={fileRef} type="file" multiple accept={ATTACHMENT_ACCEPT} className="hidden" onChange={(e) => { if (e.target.files?.length) upload(e.target.files); e.target.value = ''; }} />
      </div>

      <div className={cn('hidden md:block rounded-lg border-2 border-dashed px-3 py-3 text-center text-xs transition-colors',
        dragOver ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 text-gray-400')}>
        Drag photos or files here · JPG, PNG, HEIC, PDF, Word, Excel, PowerPoint, CSV · up to 25 MB
      </div>

      {error && <p className="text-xs font-medium text-red-600" role="alert">{error}</p>}
      {busy.length > 0 && (
        <p className="flex items-center gap-2 text-xs text-gray-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Uploading {busy.join(', ')}…</p>
      )}
      {loading ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : items.length === 0 && busy.length === 0 ? (
        <p className="text-xs text-gray-400">No attachments yet.</p>
      ) : null}

      {photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((p, idx) => (
            <div key={p.id} className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
              <button type="button" onClick={() => setViewer(idx)} className="h-full w-full" aria-label={`View ${p.file_name}`}>
                {p.url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={p.url} alt={p.file_name} loading="lazy" className="h-full w-full object-cover" />
                  : <span className="text-[10px] text-gray-400">No preview</span>}
              </button>
              <div className="absolute right-1 top-1">{deleteControl(p, true)}</div>
            </div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {files.map((f) => {
            const Icon = /Excel|CSV/.test(fileLabel(f.mime_type)) ? FileSpreadsheet : fileLabel(f.mime_type) === 'PowerPoint' ? Presentation : FileText;
            return (
              <li key={f.id} className="flex items-center gap-3 px-3 py-2">
                <Icon className="h-5 w-5 shrink-0 text-gray-400" />
                <a href={f.url} target="_blank" rel="noopener" className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-900 hover:underline">{f.file_name}</span>
                  <span className="text-[11px] text-gray-400">{fileLabel(f.mime_type)} · {fmtBytes(f.size_bytes)}</span>
                </a>
                {deleteControl(f)}
              </li>
            );
          })}
        </ul>
      )}

      {viewer !== null && photos[viewer] && (
        <PhotoViewer photos={photos} index={viewer} onIndex={setViewer} onClose={() => setViewer(null)} />
      )}
    </div>
  );
}

function PhotoViewer({ photos, index, onIndex, onClose }: { photos: Item[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const start = useRef<number | null>(null);
  const go = useCallback((d: number) => onIndex((index + d + photos.length) % photos.length), [index, photos.length, onIndex]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, onClose]);
  const p = photos[index];
  return (
    <div role="dialog" aria-modal="true" aria-label="Photo viewer" data-photo-viewer
      className="fixed inset-0 z-[90] flex flex-col bg-black/95 text-white"
      onPointerDown={(e) => { start.current = e.clientX; }}
      onPointerUp={(e) => { if (start.current === null) return; const dx = e.clientX - start.current; start.current = null; if (Math.abs(dx) > 50 && photos.length > 1) go(dx < 0 ? 1 : -1); }}
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-[max(env(safe-area-inset-top),12px)] pb-2">
        <span className="min-w-0 truncate text-sm">{p.file_name}{photos.length > 1 ? ` · ${index + 1} of ${photos.length}` : ''}</span>
        <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"><X className="h-6 w-6" /></button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-[max(env(safe-area-inset-bottom),12px)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.url} alt={p.file_name} className="max-h-full max-w-full select-none object-contain" draggable={false} />
        {photos.length > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className="absolute left-2 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 md:flex"><ChevronLeft className="h-7 w-7" /></button>
            <button type="button" onClick={() => go(1)} aria-label="Next photo" className="absolute right-2 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 md:flex"><ChevronRight className="h-7 w-7" /></button>
          </>
        )}
      </div>
    </div>
  );
}

/** Small 📎 count for cards and list rows. */
export function AttachmentBadge({ count, className }: { count?: number; className?: string }) {
  if (!count) return null;
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-gray-500', className)} title={`${count} attachment${count === 1 ? '' : 's'}`} data-attachment-count={count}>
      <Paperclip className="h-3.5 w-3.5" />{count}
    </span>
  );
}
