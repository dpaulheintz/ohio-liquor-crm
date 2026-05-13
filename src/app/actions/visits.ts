'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { KPI_OPTIONS, MAX_PHOTOS } from '@/lib/types';
import { autoCompleteAssignmentsForVisit } from './assignments';

// ─── getVisits ────────────────────────────────────────────────────────────────

export async function getVisits({
  repId,
  startDate,
  endDate,
  kpiOnly,
  visitType,
  page = 1,
  pageSize = 20,
}: {
  repId?: string;
  startDate?: string;
  endDate?: string;
  kpiOnly?: boolean;
  visitType?: 'in_person' | 'phone_call';
  page?: number;
  pageSize?: number;
} = {}) {
  const supabase = await createClient();

  // When kpiOnly is true, use !inner join so only visits with ≥1 KPI are returned
  const kpiJoin = kpiOnly ? 'visit_kpis!inner(*)' : 'visit_kpis(*)';

  let query = supabase
    .from('visit_logs')
    .select(
      `*, account:accounts!visit_logs_account_id_fkey(id, display_name, type), rep:profiles!visit_logs_rep_id_fkey(id, full_name, email), visit_photos(*), ${kpiJoin}`,
      { count: 'exact' }
    )
    .order('visited_at', { ascending: false });

  if (repId)     query = query.eq('rep_id', repId);
  if (startDate) query = query.gte('visited_at', startDate);
  if (endDate)   query = query.lte('visited_at', endDate);
  if (visitType) query = query.eq('visit_type', visitType);

  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;
  if (error) throw error;

  return { visits: data ?? [], total: count ?? 0 };
}

// ─── getVisitsByAccount ───────────────────────────────────────────────────────

export async function getVisitsByAccount(accountId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('visit_logs')
    .select(
      `*, rep:profiles!visit_logs_rep_id_fkey(id, full_name, email), visit_photos(*), visit_kpis(*)`
    )
    .eq('account_id', accountId)
    .order('visited_at', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data ?? [];
}

// ─── createVisit ──────────────────────────────────────────────────────────────

const kpiEntrySchema = z.object({
  type:     z.enum(KPI_OPTIONS),
  quantity: z.number().int().min(1).max(99).default(1),
});

const visitSchema = z.object({
  accountId: z.string().uuid('Invalid account ID'),
  visitType: z.enum(['in_person', 'phone_call']).default('in_person'),
  notes:     z.string().max(5000).optional(),
  kpis:      z.array(kpiEntrySchema).max(10).optional(),
  visitedAt: z.string().datetime({ offset: true }).optional(),
  photoUrls: z
    .array(
      z.object({
        url:        z.string().url(),
        caption:    z.string().max(140).optional(),
        sort_order: z.number().int().min(0),
      })
    )
    .max(MAX_PHOTOS, `Maximum ${MAX_PHOTOS} photos allowed`)
    .optional(),
});

export async function createVisit(input: {
  accountId: string;
  visitType?: 'in_person' | 'phone_call';
  notes?: string;
  kpis?: { type: string; quantity: number }[];
  visitedAt?: string;
  photoUrls?: { url: string; caption?: string; sort_order: number }[];
}) {
  const parsed = visitSchema.parse(input);
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Create visit log
  const { data: visit, error: visitError } = await supabase
    .from('visit_logs')
    .insert({
      account_id: parsed.accountId,
      rep_id:     user.id,
      visit_type: parsed.visitType ?? 'in_person',
      notes:      parsed.notes || null,
      visited_at: parsed.visitedAt || new Date().toISOString(),
      // Legacy columns — kept null for new records; data lives in visit_kpis
      kpi:          null,
      kpi_quantity: null,
    })
    .select()
    .single();

  if (visitError) throw visitError;

  // Save KPI entries to visit_kpis (in-person only)
  if (parsed.visitType !== 'phone_call' && parsed.kpis && parsed.kpis.length > 0) {
    const kpiRecords = parsed.kpis.map((k) => ({
      visit_id:     visit.id,
      kpi_type:     k.type,
      kpi_quantity: k.quantity,
    }));
    const { error: kpiError } = await supabase.from('visit_kpis').insert(kpiRecords);
    if (kpiError) throw kpiError;
  }

  // Save photos (in-person only, max 5)
  if (parsed.visitType !== 'phone_call' && parsed.photoUrls && parsed.photoUrls.length > 0) {
    const photoRecords = parsed.photoUrls.map((p) => ({
      visit_id:  visit.id,
      photo_url: p.url,
      caption:   p.caption || null,
      sort_order: p.sort_order,
    }));
    const { error: photoError } = await supabase.from('visit_photos').insert(photoRecords);
    if (photoError) throw photoError;
  }

  // Auto-complete any pending assignment for this account/rep (non-fatal)
  await autoCompleteAssignmentsForVisit(parsed.accountId);

  revalidatePath('/');
  revalidatePath('/assignments');
  revalidatePath(`/accounts/${parsed.accountId}`);
  return visit;
}

// ─── updateVisit ──────────────────────────────────────────────────────────────

const updateVisitSchema = z.object({
  notes:          z.string().max(5000).optional(),
  visitedAt:      z.string().datetime({ offset: true }).optional(),
  repId:          z.string().uuid().optional(),
  // KPI management via visit_kpis
  addKpis:        z.array(kpiEntrySchema).optional(),
  removeKpiIds:   z.array(z.string().uuid()).optional(),
  // Photo management
  addPhotos: z
    .array(
      z.object({
        url:        z.string().url(),
        caption:    z.string().max(140).optional(),
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
    visitedAt?: string;
    repId?: string;
    addKpis?: { type: string; quantity: number }[];
    removeKpiIds?: string[];
    addPhotos?: { url: string; caption?: string; sort_order: number }[];
    removePhotoIds?: string[];
  }
) {
  const parsed = updateVisitSchema.parse(input);
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Permission check
  const { data: existing, error: existingErr } = await supabase
    .from('visit_logs')
    .select('id, rep_id, account_id, visit_type')
    .eq('id', id)
    .single();
  if (existingErr || !existing) throw new Error('Visit not found');

  const { data: isAdminData, error: isAdminErr } = await supabase.rpc('is_admin');
  if (isAdminErr) throw new Error('Permission check failed');
  const isAdmin = isAdminData === true;

  if (!isAdmin && existing.rep_id !== user.id) {
    throw new Error('You can only edit your own visits');
  }
  if (parsed.repId !== undefined && !isAdmin) {
    throw new Error('Only admins can reassign a visit');
  }

  // Update visit_logs row
  const updates: Record<string, unknown> = {};
  if (parsed.notes    !== undefined) updates.notes      = parsed.notes || null;
  if (parsed.visitedAt !== undefined) updates.visited_at = parsed.visitedAt;
  if (parsed.repId    !== undefined) updates.rep_id     = parsed.repId;

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from('visit_logs').update(updates).eq('id', id);
    if (error) throw error;
  }

  // Remove KPI entries
  if (parsed.removeKpiIds && parsed.removeKpiIds.length > 0) {
    const { error } = await supabase
      .from('visit_kpis')
      .delete()
      .in('id', parsed.removeKpiIds);
    if (error) throw error;
  }

  // Add new KPI entries (only for in-person visits)
  if (parsed.addKpis && parsed.addKpis.length > 0 && existing.visit_type !== 'phone_call') {
    const records = parsed.addKpis.map((k) => ({
      visit_id:     id,
      kpi_type:     k.type,
      kpi_quantity: k.quantity,
    }));
    const { error } = await supabase.from('visit_kpis').insert(records);
    if (error) throw error;
  }

  // Remove photos
  if (parsed.removePhotoIds && parsed.removePhotoIds.length > 0) {
    const { error } = await supabase
      .from('visit_photos')
      .delete()
      .in('id', parsed.removePhotoIds);
    if (error) throw error;
  }

  // Add photos (only for in-person visits)
  if (parsed.addPhotos && parsed.addPhotos.length > 0 && existing.visit_type !== 'phone_call') {
    const records = parsed.addPhotos.map((p) => ({
      visit_id:   id,
      photo_url:  p.url,
      caption:    p.caption || null,
      sort_order: p.sort_order,
    }));
    const { error } = await supabase.from('visit_photos').insert(records);
    if (error) throw error;
  }

  revalidatePath('/');
  revalidatePath(`/accounts/${existing.account_id}`);
  revalidatePath('/admin');
  return { id, account_id: existing.account_id };
}

// ─── getPhotoAudit ────────────────────────────────────────────────────────────

export async function getPhotoAudit({
  repId,
  startDate,
  endDate,
  page = 1,
  pageSize = 20,
}: {
  repId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  const supabase = await createClient();

  let query = supabase
    .from('visit_logs')
    .select(
      `id, visited_at, notes, kpi, kpi_quantity, visit_type, rep_id, account_id,
       rep:profiles!visit_logs_rep_id_fkey(id, full_name, email),
       account:accounts!visit_logs_account_id_fkey(id, display_name),
       visit_photos!inner(*),
       visit_kpis(id, kpi_type, kpi_quantity)`,
      { count: 'exact' }
    )
    .order('visited_at', { ascending: false });

  if (repId)     query = query.eq('rep_id', repId);
  if (startDate) query = query.gte('visited_at', startDate);
  if (endDate)   query = query.lte('visited_at', endDate);

  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;
  if (error) throw error;

  return { visits: data ?? [], total: count ?? 0 };
}

// ─── getRepActivity ───────────────────────────────────────────────────────────

export async function getRepActivity() {
  const supabase = await createClient();

  const { data: reps } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .in('role', ['rep', 'admin']);

  if (!reps) return [];

  const now         = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const { data: visits } = await supabase
    .from('visit_logs')
    .select('rep_id, visited_at, account_id')
    .gte('visited_at', startOfMonth.toISOString());

  const repActivity = reps.map((rep) => {
    const repVisits   = visits?.filter((v) => v.rep_id === rep.id) ?? [];
    const weekVisits  = repVisits.filter((v) => new Date(v.visited_at) >= startOfWeek);
    const uniqueAccts = new Set(repVisits.map((v) => v.account_id));
    const lastVisit   = repVisits.length > 0
      ? repVisits.reduce((latest, v) =>
          new Date(v.visited_at) > new Date(latest.visited_at) ? v : latest
        )
      : null;

    return {
      rep,
      visitsThisWeek:   weekVisits.length,
      visitsThisMonth:  repVisits.length,
      accountsVisited:  uniqueAccts.size,
      lastActive:       lastVisit?.visited_at ?? null,
    };
  });

  return repActivity;
}
