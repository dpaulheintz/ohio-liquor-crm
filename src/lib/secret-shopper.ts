export const SHOPPER_LOCATIONS = ['Grandview', 'Westerville', 'Gahanna', 'PO Box 21'] as const;
export type ShopperLocation = (typeof SHOPPER_LOCATIONS)[number];

export const SERVICE_TYPES = ['Bar', 'Table'] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const SECTION_KEYS = [
  'outside', 'hostess', 'ambiance', 'table', 'server', 'food', 'restroom', 'check', 'departure',
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTIONS: { key: SectionKey; title: string; short: string; notesLabel: string }[] = [
  { key: 'outside', title: 'The Outside', short: 'Outside', notesLabel: 'Notes on the exterior' },
  { key: 'hostess', title: 'The Hostess', short: 'Hostess', notesLabel: 'Notes on Hostess' },
  { key: 'ambiance', title: 'The Ambiance', short: 'Ambiance', notesLabel: 'Ambiance notes' },
  { key: 'table', title: 'The Table', short: 'Table', notesLabel: 'Table notes' },
  { key: 'server', title: 'The Server / Bartender', short: 'Server', notesLabel: 'Server / Bartender notes' },
  { key: 'food', title: 'The Food', short: 'Food', notesLabel: 'Food notes' },
  { key: 'restroom', title: 'The Restrooms', short: 'Restrooms', notesLabel: 'Notes on the restrooms' },
  { key: 'check', title: 'The Check', short: 'Check', notesLabel: 'Notes on the check' },
  { key: 'departure', title: 'The Departure', short: 'Departure', notesLabel: 'Final notes on the service experience' },
];

export const MEDIA_LIMITS = {
  maxPhotos: 10,
  maxVideos: 3,
  maxVideoSeconds: 60,
  maxVideoBytes: 50 * 1024 * 1024,
  maxPhotoBytes: 15 * 1024 * 1024,
  photoMaxEdge: 1600,
} as const;

export const MAX_NOTES_LENGTH = 5000;
export const MEDIA_BUCKET = 'secret-shopper-media';

export type MediaType = 'photo' | 'video';

export interface SecretShopperMediaInput {
  section: SectionKey | null;
  media_type: MediaType;
  storage_path: string;
}

export interface SecretShopperSubmission {
  visit_id: string;
  location: ShopperLocation;
  visit_date: string;
  service_type: ServiceType;
  sections: Record<SectionKey, { rating: number | null; notes: string }>;
  order_placed_at: string | null;
  food_delivered_at: string | null;
  manual_ticket_minutes: number | null;
  shopper_email: string;
  honeypot: string;
  media: SecretShopperMediaInput[];
}

export interface SecretShopperMediaRow {
  id: string;
  section: SectionKey | null;
  media_type: MediaType;
  storage_path: string;
}

export type SecretShopperVisitRow = {
  id: string;
  location: ShopperLocation;
  visit_date: string;
  service_type: ServiceType;
  overall_score: number | null;
  ticket_time_seconds: number | null;
  ticket_time_source: 'timer' | 'manual' | null;
  order_placed_at: string | null;
  food_delivered_at: string | null;
  shopper_email: string;
  gift_card_status: 'pending' | 'sent';
  gift_card_sent_at: string | null;
  gift_card_sent_by_name: string | null;
  created_at: string;
  media: SecretShopperMediaRow[];
} & { [K in SectionKey as `${K}_rating`]: number | null } & { [K in SectionKey as `${K}_notes`]: string | null };

export function sectionLabel(key: SectionKey, serviceType: ServiceType | '' | null): string {
  const s = SECTIONS.find((x) => x.key === key)!;
  if (key === 'server' && serviceType === 'Bar') return 'The Bartender';
  if (key === 'server' && serviceType === 'Table') return 'The Server';
  return s.title;
}

export function storagePathPrefix(visitId: string): string {
  return `visits/${visitId}/`;
}

export function fmtTicketTime(seconds: number | null): string {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} min ${s} sec` : `${s} sec`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}
