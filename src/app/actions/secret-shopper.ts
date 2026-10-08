'use server';

import { headers } from 'next/headers';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { createAnonClient, ipHashFromHeaders, rateLimitCount, recordRateEvent } from '@/lib/secret-shopper-server';
import {
  MAX_NOTES_LENGTH,
  MEDIA_BUCKET,
  MEDIA_LIMITS,
  SECTION_KEYS,
  SERVICE_TYPES,
  SHOPPER_LOCATIONS,
  isUuid,
  storagePathPrefix,
  type SecretShopperSubmission,
  type SecretShopperVisitRow,
  type SectionKey,
} from '@/lib/secret-shopper';

const SUBMITS_PER_HOUR = 3;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MAX_TICKET_SECONDS = 6 * 60 * 60;

export type SubmitResult = { ok: true; mediaSaved: number; mediaDropped: number } | { ok: false; error: string };

// ─── Public: submit a visit (no auth) ─────────────────────────────────────────

export async function submitSecretShopperVisit(input: SecretShopperSubmission): Promise<SubmitResult> {
  // Honeypot: bots fill every field. Pretend success, store nothing.
  if (typeof input?.honeypot === 'string' && input.honeypot.trim() !== '') {
    return { ok: true, mediaSaved: 0, mediaDropped: 0 };
  }

  if (!isUuid(input?.visit_id)) return { ok: false, error: 'Something went wrong. Please refresh and try again.' };
  if (!SHOPPER_LOCATIONS.includes(input.location)) return { ok: false, error: 'Please choose a location.' };
  if (!SERVICE_TYPES.includes(input.service_type)) return { ok: false, error: 'Please choose Bar or Table service.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.visit_date ?? '')) return { ok: false, error: 'Please enter the visit date.' };

  const email = String(input.shopper_email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 320) return { ok: false, error: 'Please enter a valid email for your gift card.' };

  const row: Record<string, unknown> = {
    id: input.visit_id,
    location: input.location,
    visit_date: input.visit_date,
    service_type: input.service_type,
    shopper_email: email,
  };

  for (const key of SECTION_KEYS) {
    const s = input.sections?.[key];
    const rating = s?.rating;
    if (rating != null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) {
      return { ok: false, error: 'Ratings must be between 1 and 5 stars.' };
    }
    const notes = typeof s?.notes === 'string' ? s.notes.trim() : '';
    if (notes.length > MAX_NOTES_LENGTH) return { ok: false, error: 'One of your notes is too long.' };
    row[`${key}_rating`] = rating ?? null;
    row[`${key}_notes`] = notes || null;
  }

  // Ticket time: the database derives seconds from the two timestamps (timer) or keeps the manual value.
  const placed = parseIso(input.order_placed_at);
  const delivered = parseIso(input.food_delivered_at);
  if (placed && delivered) {
    const secs = (delivered.getTime() - placed.getTime()) / 1000;
    if (secs < 0 || secs > MAX_TICKET_SECONDS) return { ok: false, error: 'The ticket timer looks off. Reset it or enter minutes manually.' };
    row.order_placed_at = placed.toISOString();
    row.food_delivered_at = delivered.toISOString();
  } else if (input.manual_ticket_minutes != null) {
    const mins = Number(input.manual_ticket_minutes);
    if (!Number.isFinite(mins) || mins <= 0 || mins * 60 > MAX_TICKET_SECONDS) {
      return { ok: false, error: 'Please enter the ticket time in minutes (1–360).' };
    }
    row.ticket_time_seconds = Math.round(mins * 60);
    if (placed) row.order_placed_at = placed.toISOString();
  } else if (placed) {
    row.order_placed_at = placed.toISOString();
  }

  const ipHash = ipHashFromHeaders(await headers());
  if ((await rateLimitCount(ipHash, 'submit', 60 * 60 * 1000)) >= SUBMITS_PER_HOUR) {
    return { ok: false, error: 'Too many submissions from this network. Please try again in an hour — your draft is saved.' };
  }

  const anon = createAnonClient();
  const { error: visitErr } = await anon.from('secret_shopper_visits').insert(row);
  if (visitErr) {
    // Same visit_id already stored → a retried submit after a dropped response. Treat as success.
    if (visitErr.code === '23505') return { ok: true, mediaSaved: 0, mediaDropped: 0 };
    console.error('secret-shopper visit insert failed:', visitErr);
    return { ok: false, error: 'We couldn’t save your review. Please try again — your draft is saved.' };
  }
  await recordRateEvent(ipHash, 'submit');

  const { saved, dropped } = await saveMedia(input.visit_id, input.media);
  return { ok: true, mediaSaved: saved, mediaDropped: dropped };
}

function parseIso(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// The written review is already saved; media problems only drop media, never the visit.
async function saveMedia(visitId: string, media: SecretShopperSubmission['media']): Promise<{ saved: number; dropped: number }> {
  const list = Array.isArray(media) ? media : [];
  if (list.length === 0) return { saved: 0, dropped: 0 };

  const prefix = storagePathPrefix(visitId);
  const { data: objects, error: listErr } = await createAdminClient()
    .storage.from(MEDIA_BUCKET)
    .list(prefix.slice(0, -1), { limit: 100 });
  if (listErr) {
    console.error('secret-shopper media list failed:', listErr);
    return { saved: 0, dropped: list.length };
  }
  const uploaded = new Set((objects ?? []).map((o) => `${prefix}${o.name}`));

  const counts = { photo: 0, video: 0 };
  const seen = new Set<string>();
  const rows = list.filter((m) => {
    if (m.media_type !== 'photo' && m.media_type !== 'video') return false;
    if (m.section !== null && !SECTION_KEYS.includes(m.section as SectionKey)) return false;
    if (typeof m.storage_path !== 'string' || !uploaded.has(m.storage_path) || seen.has(m.storage_path)) return false;
    const cap = m.media_type === 'photo' ? MEDIA_LIMITS.maxPhotos : MEDIA_LIMITS.maxVideos;
    if (counts[m.media_type] >= cap) return false;
    counts[m.media_type]++;
    seen.add(m.storage_path);
    return true;
  }).map((m) => ({ visit_id: visitId, section: m.section, media_type: m.media_type, storage_path: m.storage_path }));

  if (rows.length === 0) return { saved: 0, dropped: list.length };
  const { error } = await createAnonClient().from('secret_shopper_media').insert(rows);
  if (error) {
    console.error('secret-shopper media insert failed:', error);
    return { saved: 0, dropped: list.length };
  }
  return { saved: rows.length, dropped: list.length - rows.length };
}

// ─── Admin ────────────────────────────────────────────────────────────────────

export type SecretShopperAccess = 'admin' | 'demo' | 'none';

export async function getSecretShopperAccess(): Promise<SecretShopperAccess> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return 'none';
  const [{ data: isAdmin }, { data: profile }] = await Promise.all([
    supabase.rpc('is_admin'),
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
  ]);
  if (isAdmin === true) return 'admin';
  if (profile?.role === 'demo') return 'demo';
  return 'none';
}

async function requireAdminClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { data: isAdmin, error } = await supabase.rpc('is_admin');
  if (error || isAdmin !== true) throw new Error('Admin only');
  return supabase;
}

export async function getSecretShopperVisits(): Promise<SecretShopperVisitRow[]> {
  const supabase = await requireAdminClient();
  const { data, error } = await supabase
    .from('secret_shopper_visits')
    .select('*, secret_shopper_media(id, section, media_type, storage_path), sent_by:profiles!secret_shopper_visits_gift_card_sent_by_fkey(full_name, email)')
    .order('visit_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to load secret shopper visits: ${error.message}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map(({ secret_shopper_media, sent_by, ...v }: any) => ({
    ...v,
    overall_score: v.overall_score == null ? null : Number(v.overall_score),
    gift_card_sent_by_name: sent_by ? (sent_by.full_name || sent_by.email) : null,
    media: secret_shopper_media ?? [],
  }));
}

export async function getVisitMediaUrls(visitId: string): Promise<Record<string, string>> {
  if (!isUuid(visitId)) throw new Error('Invalid visit');
  const supabase = await requireAdminClient();
  const { data: media, error } = await supabase
    .from('secret_shopper_media')
    .select('storage_path')
    .eq('visit_id', visitId);
  if (error) throw new Error(error.message);
  const paths = (media ?? []).map((m) => m.storage_path);
  if (paths.length === 0) return {};

  const { data: signed, error: signErr } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrls(paths, 60 * 60);
  if (signErr) throw new Error(signErr.message);
  const out: Record<string, string> = {};
  for (const s of signed ?? []) if (s.path && s.signedUrl) out[s.path] = s.signedUrl;
  return out;
}

export async function markGiftCardSent(visitId: string): Promise<{ gift_card_sent_at: string; gift_card_sent_by_name: string | null }> {
  if (!isUuid(visitId)) throw new Error('Invalid visit');
  const supabase = await requireAdminClient();
  const { data, error } = await supabase
    .from('secret_shopper_visits')
    .update({ gift_card_status: 'sent' })
    .eq('id', visitId)
    .select('gift_card_sent_at, sent_by:profiles!secret_shopper_visits_gift_card_sent_by_fkey(full_name, email)')
    .single();
  if (error) throw new Error(`Failed to mark gift card sent: ${error.message}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sentBy = (data as any).sent_by;
  return {
    gift_card_sent_at: data.gift_card_sent_at as string,
    gift_card_sent_by_name: sentBy ? (sentBy.full_name || sentBy.email) : null,
  };
}
