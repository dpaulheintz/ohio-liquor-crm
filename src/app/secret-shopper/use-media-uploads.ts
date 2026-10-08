'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MEDIA_LIMITS, type MediaType, type SectionKey, type SecretShopperMediaInput } from '@/lib/secret-shopper';

export type UploadStatus = 'processing' | 'uploading' | 'done' | 'error';

export interface UploadItem {
  id: string;
  section: SectionKey | null;
  mediaType: MediaType;
  name: string;
  status: UploadStatus;
  progress: number;
  error?: string;
  storagePath?: string;
  previewUrl?: string;
  blob?: Blob;
}

/** What survives a reload: only finished uploads (the file already lives in storage). */
export interface PersistedMedia {
  id: string;
  section: SectionKey | null;
  mediaType: MediaType;
  name: string;
  storagePath: string;
}

const EXT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/x-m4v', '3gp': 'video/3gpp',
};

function fileType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TYPES[ext] ?? '';
}

function videoDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    let settled = false;
    const finish = (d: number | null) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(d);
    };
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = () => finish(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => finish(null);
    setTimeout(() => finish(null), 6000);
    video.src = url;
  });
}

async function compressPhoto(file: File): Promise<Blob> {
  try {
    const { default: imageCompression } = await import('browser-image-compression');
    return await imageCompression(file, {
      maxWidthOrHeight: MEDIA_LIMITS.photoMaxEdge,
      maxSizeMB: 1.5,
      initialQuality: 0.82,
      fileType: 'image/jpeg',
      useWebWorker: true,
    });
  } catch {
    // Formats the browser can't decode (e.g. HEIC outside Safari) upload as-is.
    return file;
  }
}

function putWithProgress(url: string, blob: Blob, name: string, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('apikey', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error('Network error — check your connection'));
    xhr.ontimeout = () => reject(new Error('Upload timed out'));
    const form = new FormData();
    form.append('cacheControl', '3600');
    form.append('', blob, name);
    xhr.send(form);
  });
}

export function useMediaUploads(visitId: string, initial: PersistedMedia[]) {
  const [items, setItems] = useState<UploadItem[]>(() =>
    initial.map((m) => ({ ...m, status: 'done' as const, progress: 1 })),
  );
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => () => {
    for (const i of itemsRef.current) if (i.previewUrl) URL.revokeObjectURL(i.previewUrl);
  }, []);

  const update = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }, []);

  const upload = useCallback(async (item: UploadItem, blob: Blob) => {
    update(item.id, { status: 'uploading', progress: 0, error: undefined });
    try {
      const res = await fetch('/api/secret-shopper/upload-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          visitId,
          section: item.section,
          mediaType: item.mediaType,
          contentType: blob.type,
          size: blob.size,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      await putWithProgress(json.signedUrl, blob, item.name, (p) => update(item.id, { progress: p }));
      update(item.id, { status: 'done', progress: 1, storagePath: json.path, blob: undefined });
    } catch (err) {
      update(item.id, { status: 'error', error: err instanceof Error ? err.message : 'Upload failed' });
    }
  }, [update, visitId]);

  /** Returns messages for files that were rejected up front. */
  const addFiles = useCallback(async (files: File[], section: SectionKey | null): Promise<string[]> => {
    const rejected: string[] = [];
    let photos = itemsRef.current.filter((i) => i.mediaType === 'photo').length;
    let videos = itemsRef.current.filter((i) => i.mediaType === 'video').length;

    for (const file of files) {
      const type = fileType(file);
      const mediaType: MediaType | null = type.startsWith('image/') ? 'photo' : type.startsWith('video/') ? 'video' : null;
      if (!mediaType) { rejected.push(`${file.name}: not a photo or video`); continue; }
      if (mediaType === 'photo' && photos >= MEDIA_LIMITS.maxPhotos) { rejected.push(`Photo limit reached (${MEDIA_LIMITS.maxPhotos})`); continue; }
      if (mediaType === 'video' && videos >= MEDIA_LIMITS.maxVideos) { rejected.push(`Video limit reached (${MEDIA_LIMITS.maxVideos})`); continue; }
      if (mediaType === 'video' && file.size > MEDIA_LIMITS.maxVideoBytes) { rejected.push(`${file.name}: videos must be under 50 MB`); continue; }
      if (mediaType === 'photo') photos++; else videos++;

      const item: UploadItem = {
        id: crypto.randomUUID(),
        section,
        mediaType,
        name: file.name || (mediaType === 'photo' ? 'photo.jpg' : 'video.mp4'),
        status: 'processing',
        progress: 0,
      };
      setItems((prev) => [...prev, item]);

      void (async () => {
        let blob: Blob;
        if (mediaType === 'video') {
          const secs = await videoDuration(file);
          if (secs != null && secs > MEDIA_LIMITS.maxVideoSeconds + 1) {
            update(item.id, { status: 'error', error: `Video is ${Math.round(secs)}s — max ${MEDIA_LIMITS.maxVideoSeconds}s` });
            return;
          }
          blob = type === file.type ? file : new Blob([file], { type });
        } else {
          blob = await compressPhoto(file);
          if (blob.size > MEDIA_LIMITS.maxPhotoBytes) {
            update(item.id, { status: 'error', error: 'Photo is too large' });
            return;
          }
        }
        update(item.id, { blob, previewUrl: mediaType === 'photo' ? URL.createObjectURL(blob) : undefined });
        await upload(item, blob);
      })();
    }
    return rejected;
  }, [update, upload]);

  const retry = useCallback((id: string) => {
    const item = itemsRef.current.find((i) => i.id === id);
    if (item?.blob) void upload(item, item.blob);
  }, [upload]);

  const remove = useCallback((id: string) => {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  const clearAll = useCallback(() => {
    for (const i of itemsRef.current) if (i.previewUrl) URL.revokeObjectURL(i.previewUrl);
    setItems([]);
  }, []);

  const persisted = useMemo<PersistedMedia[]>(
    () => items
      .filter((i) => i.status === 'done' && i.storagePath)
      .map(({ id, section, mediaType, name, storagePath }) => ({ id, section, mediaType, name, storagePath: storagePath! })),
    [items],
  );

  const submission = useMemo<SecretShopperMediaInput[]>(
    () => persisted.map((m) => ({ section: m.section, media_type: m.mediaType, storage_path: m.storagePath })),
    [persisted],
  );

  const inFlight = items.filter((i) => i.status === 'processing' || i.status === 'uploading').length;
  const failed = items.filter((i) => i.status === 'error').length;

  return { items, addFiles, retry, remove, clearAll, persisted, submission, inFlight, failed };
}
