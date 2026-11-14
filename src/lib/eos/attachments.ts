// EOS opportunity attachments: shared constants and helpers (client-safe).

export const ATTACHMENT_BUCKET = 'eos-opportunity-files';
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export interface OpportunityAttachment {
  id: string;
  opportunity_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string | null;
  created_at: string;
}

/** Allowed types by extension → the content type we store. Photos: JPG/PNG (HEIC/HEIF get converted to JPG). */
const TYPES: Record<string, { mime: string; kind: 'image' | 'file'; label: string }> = {
  jpg: { mime: 'image/jpeg', kind: 'image', label: 'Photo' },
  jpeg: { mime: 'image/jpeg', kind: 'image', label: 'Photo' },
  png: { mime: 'image/png', kind: 'image', label: 'Photo' },
  heic: { mime: 'image/jpeg', kind: 'image', label: 'Photo' },
  heif: { mime: 'image/jpeg', kind: 'image', label: 'Photo' },
  pdf: { mime: 'application/pdf', kind: 'file', label: 'PDF' },
  doc: { mime: 'application/msword', kind: 'file', label: 'Word' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'file', label: 'Word' },
  xls: { mime: 'application/vnd.ms-excel', kind: 'file', label: 'Excel' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', kind: 'file', label: 'Excel' },
  ppt: { mime: 'application/vnd.ms-powerpoint', kind: 'file', label: 'PowerPoint' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', kind: 'file', label: 'PowerPoint' },
  csv: { mime: 'text/csv', kind: 'file', label: 'CSV' },
};

/** For the <input accept> attribute. */
export const ATTACHMENT_ACCEPT = Object.keys(TYPES).map((e) => `.${e}`).join(',') + ',image/heic,image/heif,image/jpeg,image/png';

export const extOf = (name: string) => (name.split('.').pop() ?? '').toLowerCase();
export const isHeic = (f: { name: string; type: string }) => /^(heic|heif)$/.test(extOf(f.name)) || /image\/hei[cf]/i.test(f.type);

export function attachmentType(f: { name: string; type: string }) {
  const byExt = TYPES[extOf(f.name)];
  if (byExt) return byExt;
  // a photo straight from a phone camera can arrive without a useful name
  if (f.type === 'image/jpeg') return TYPES.jpg;
  if (f.type === 'image/png') return TYPES.png;
  if (/image\/hei[cf]/i.test(f.type)) return TYPES.heic;
  return null;
}

export const isImageMime = (mime: string) => mime === 'image/jpeg' || mime === 'image/png';

export function fileLabel(mime: string): string {
  return Object.values(TYPES).find((t) => t.mime === mime)?.label ?? 'File';
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** Storage path: <opportunity id>/<random>-<safe file name>. */
export function storagePathFor(opportunityId: string, fileName: string): string {
  const safe = fileName.normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').slice(-80) || 'file';
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${opportunityId}/${rand}-${safe}`;
}
