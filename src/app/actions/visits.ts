'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { KPI_OPTIONS } from '@/lib/types';

const MAX_PHOTOS = 5;

export async function getVisits({
  repId,
  page = 1,
  pageSize = 20,
}: {
  repId?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  const supabase = await createClient();

  let query = supabase
    .from('visit_logs')
    .select(
      `*, account:accounts!visit_logs_account_id_fkey(id, display_name, type), rep:profiles!visit_logs_rep_id_fkey(id, full_name, email), visit_photos(*)`,
      { count: 'exact' }
    )
    .order('visited_at', { ascending: false });

  if (repId) {
    query = query.eq('rep_id', repId);
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;
  if (error) throw error;

  return { visits: data ?? [], total: count ?? 0 };
}

export async function getVisitsByAccount(accountId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('visit_logs')
    .select(
      `*, rep:profiles!visit_logs_rep_id_fkey(id, full_name, email), visit_photos(*)`
    )
    .eq('account_id', accountId)
    .order('visited_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data ?? [];
}

const visitSchema = z.object({
  accountId: z.string().uuid('Invalid account ID'),
  notes: z.string().max(5000).optional(),
  kpi: z.enum(KPI_OPTIONS).optional(),
  visitedAt: z.string().datetime({ offset: true }).optional(),
  photoUrls: z
    .array(
      z.object({
        url: z.string().url(),
        caption: z.string().max(140).optional(),
        sort_order: z.number().int().min(0),
      })
    )
    .max(MAX_PHOTOS, `Maximum ${MAX_PHOTOS} photos allowed`)
    .optional(),
});

export async function createVisit(input: {
  accountId: string;
  notes?: string;
  kpi?: string;
  visitedAt?: string;
  photoUrls?: { url: string; caption?: string; sort_order: number }[];
}) {
  const parsed = visitSchema.parse(input);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Create visit log
  const { data: visit, error: visitError } = await supabase
    .from('visit_logs')
    .insert({
      account_id: parsed.accountId,
      rep_id: user.id,
      notes: parsed.notes || null,
      kpi: parsed.kpi || null,
      visited_at: parsed.visitedAt || new Date().toISOString(),
    })
    .select()
    .single();

  if (visitError) throw visitError;

  // Create photo records if any (max 5 enforced by schema)
  if (parsed.photoUrls && parsed.photoUrls.length > 0) {
    const photoRecords = parsed.photoUrls.map((p) => ({
      visit_id: visit.id,
      photo_url: p.url,
      caption: p.caption || null,
      sort_order: p.sort_order,
    }));

    const { error: photoError } = await supabase
      .from('visit_photos')
      .insert(photoRecords);

    if (photoError) throw photoError;
  }

  revalidatePath('/');
  revalidatePath(`/accounts/${parsed.accountId}`);
  return visit;
}

const updateVisitSchema = z.object({
  notes: z.string().max(5000).optional(),
  kpi: z.enum(KPI_OPTIONS).optional(),
  visitedAt: z.string().datetime({ offset: true }).optional(),
  repId: z.string().uuid().optional(),
  addPhotos: z
    .array(
      z.object({
        url: z.string().url(),
        caption: z.string().max(140).optional(),
        sort_order: z.number().int().min(0),
      })
    )
    .optional(),
  removePhotoIds: z.array(z.string().uuid()).optional(),
});

export async function updateVisit(
  id: string,
  input: {
    notes?: string;
    kpi?: string;
    visitedAt?: string;
    repId?: string;
    addPhotos?: { url: string; caption?: string; sort_order: number }[];
    removePhotoIds?: string[];
  }
) {
  const parsed = updateVisitSchema.parse(input);
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Permission check: reps can only edit their own visits; admins can edit any
  const { data: existing, error: existingErr } = await supabase
    .from('visit_logs')
    .select('id, rep_id, account_id')
    .eq('id', id)
    .single();
  if (existingErr || !existing) throw new Error('Visit not found');

  const { data: me } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  const isAdmin = me?.role === 'admin';
  if (!isAdmin && existing.rep_id !== user.id) {
    throw new Error('You can only edit your own visits');
  }

  // Only admins can reassign the rep
  if (parsed.repId !== undefined && !isAdmin) {
    throw new Error('Only admins can reassign a visit');
  }

  const updates: Record<string, unknown> = {};
  if (parsed.notes !== undefined) updates.notes = parsed.notes || null;
  if (parsed.kpi !== undefined) updates.kpi = parsed.kpi || null;
  if (parsed.visitedAt !== undefined) updates.visited_at = parsed.visitedAt;
  if (parsed.repId !== undefined) updates.rep_id = parsed.repId;

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from('visit_logs')
      .update(updates)
      .eq('id', id);
    if (error) throw error;
  }

  // Remove photos if requested
  if (parsed.removePhotoIds && parsed.removePhotoIds.length > 0) {
    const { error: delErr } = await supabase
      .from('visit_photos')
      .delete()
      .in('id', parsed.removePhotoIds);
    if (delErr) throw delErr;
  }

  // Add new photos if any
  if (parsed.addPhotos && parsed.addPhotos.length > 0) {
    const records = parsed.addPhotos.map((p) => ({
      visit_id: id,
      photo_url: p.url,
      caption: p.caption || null,
      sort_order: p.sort_order,
    }));
    const { error: insErr } = await supabase
      .from('visit_photos')
      .insert(records);
    if (insErr) throw insErr;
  }

  revalidatePath('/');
  revalidatePath(`/accounts/${existing.account_id}`);
  revalidatePath('/admin');
  return { id, account_id: existing.account_id };
}

export async function getPhotoAudit({
  repId,
  startDate,
  endDate,
  page = 1,
  pageSize = 20,
}: {
  repId?: string;
  startDate?: string; // ISO
  endDate?: string; // ISO
  page?: number;
  pageSize?: number;
} = {}) {
  const supabase = await createClient();

  let query = supabase
    .from('visit_logs')
    .select(
      `id, visited_at, notes, kpi, rep_id, account_id,
       rep:profiles!visit_logs_rep_id_fkey(id, full_name, email),
       account:accounts!visit_logs_account_id_fkey(id, display_name),
       visit_photos!inner(*)`,
      { count: 'exact' }
    )
    .order('visited_at', { ascending: false });

  if (repId) query = query.eq('rep_id', repId);
  if (startDate) query = query.gte('visited_at', startDate);
  if (endDate) query = query.lte('visited_at', endDate);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;
  if (error) throw error;

  return { visits: data ?? [], total: count ?? 0 };
}

export async function getRepActivity() {
  const supabase = await createClient();

  // Get all reps
  const { data: reps } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .in('role', ['rep', 'admin']);

  if (!reps) return [];

  // Get visit counts per rep for this week and month
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const { data: visits } = await supabase
    .from('visit_logs')
    .select('rep_id, visited_at, account_id')
    .gte('visited_at', startOfMonth.toISOString());

  const repActivity = reps.map((rep) => {
    const repVisits = visits?.filter((v) => v.rep_id === rep.id) ?? [];
    const weekVisits = repVisits.filter(
      (v) => new Date(v.visited_at) >= startOfWeek
    );
    const uniqueAccounts = new Set(repVisits.map((v) => v.account_id));
    const lastVisit = repVisits.length > 0
      ? repVisits.reduce((latest, v) =>
          new Date(v.visited_at) > new Date(latest.visited_at) ? v : latest
        )
      : null;

    return {
      rep,
      visitsThisWeek: weekVisits.length,
      visitsThisMonth: repVisits.length,
      accountsVisited: uniqueAccounts.size,
      lastActive: lastVisit?.visited_at ?? null,
    };
  });

  return repActivity;
}
