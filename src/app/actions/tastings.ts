'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { TastingStatus } from '@/lib/types';

const TASTING_SELECT = `
  id, agency_id, date, start_time, end_time, city, status,
  staff_category, staff_person, notes, report_url, created_by, created_at, updated_at,
  agency:accounts!tastings_agency_id_fkey(id, display_name, city, address, agency_id, state, zip),
  creator:profiles!tastings_created_by_fkey(id, full_name, email)
`.trim();

const tastingSchema = z.object({
  agencyId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Invalid time'),
  endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Invalid time'),
  city: z.string().max(200).optional(),
  status: z.enum(['needs_staff', 'scheduled', 'staffed', 'completed', 'cancelled']).optional(),
  staffCategory: z.enum(['DBC', 'HB Internal Staff', 'HB Sales Team']).optional(),
  staffPerson: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});

export function computeStatus(staffCategory?: string, staffPerson?: string): TastingStatus {
  if (staffPerson?.trim()) return 'staffed';
  if (staffCategory) return 'scheduled';
  return 'needs_staff';
}

// ---------- Read ----------

export async function getTastings({
  status,
  staffCategory,
  dateFrom,
  dateTo,
  city,
  agencyId,
  upcoming,
}: {
  status?: string;
  staffCategory?: string;
  dateFrom?: string;
  dateTo?: string;
  city?: string;
  agencyId?: string;
  upcoming?: boolean;
} = {}) {
  const supabase = await createClient();

  let query = supabase
    .from('tastings')
    .select(TASTING_SELECT)
    .order('date', { ascending: true })
    .order('start_time', { ascending: true });

  if (status) query = query.eq('status', status);
  if (staffCategory) query = query.eq('staff_category', staffCategory);
  if (dateFrom) query = query.gte('date', dateFrom);
  if (dateTo) query = query.lte('date', dateTo);
  if (city) query = query.ilike('city', `%${city}%`);
  if (agencyId) query = query.eq('agency_id', agencyId);
  if (upcoming) {
    const today = new Date().toISOString().slice(0, 10);
    query = query
      .gte('date', today)
      .not('status', 'in', '("completed","cancelled")');
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getTasting(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tastings')
    .select(TASTING_SELECT)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function getTastingsByAgency(agencyId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tastings')
    .select(TASTING_SELECT)
    .eq('agency_id', agencyId)
    .order('date', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getTastingStats() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  // Week boundaries (Mon–Sun)
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sun
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - dayOfWeek);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const weekStartStr = weekStart.toISOString().slice(0, 10);
  const weekEndStr = weekEnd.toISOString().slice(0, 10);

  const monthStart = today.slice(0, 7) + '-01';
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    .toISOString()
    .slice(0, 10);

  const { data, error } = await supabase
    .from('tastings')
    .select('status, date');
  if (error) throw error;

  const all = data ?? [];
  return {
    upcoming: all.filter(
      (t) => t.date >= today && !['completed', 'cancelled'].includes(t.status)
    ).length,
    needsStaff: all.filter((t) => t.status === 'needs_staff').length,
    thisWeek: all.filter(
      (t) =>
        t.date >= weekStartStr &&
        t.date <= weekEndStr &&
        t.status !== 'cancelled'
    ).length,
    thisMonth: all.filter(
      (t) =>
        t.date >= monthStart &&
        t.date <= monthEnd &&
        t.status !== 'cancelled'
    ).length,
    completed: all.filter((t) => t.status === 'completed').length,
  };
}

// ---------- Create ----------

export async function createTasting(input: {
  agencyId: string;
  date: string;
  startTime: string;
  endTime: string;
  city?: string;
  staffCategory?: string;
  staffPerson?: string;
  notes?: string;
  status?: string;
}) {
  const parsed = tastingSchema.parse(input);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const status = (parsed.status ??
    computeStatus(parsed.staffCategory, parsed.staffPerson)) as TastingStatus;

  const { data, error } = await supabase
    .from('tastings')
    .insert({
      agency_id: parsed.agencyId,
      date: parsed.date,
      start_time: parsed.startTime,
      end_time: parsed.endTime,
      city: parsed.city || null,
      status,
      staff_category: parsed.staffCategory || null,
      staff_person: parsed.staffPerson || null,
      notes: parsed.notes || null,
      created_by: user.id,
    })
    .select(TASTING_SELECT)
    .single();

  if (error) throw error;
  revalidatePath('/admin/tastings');
  return data;
}

// Create multiple tastings at once
export async function createTastingsBulk(
  inputs: Array<{
    agencyId: string;
    date: string;
    startTime: string;
    endTime: string;
    city?: string;
    staffCategory?: string;
    staffPerson?: string;
    notes?: string;
  }>
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const rows = inputs.map((input) => {
    const parsed = tastingSchema.parse(input);
    return {
      agency_id: parsed.agencyId,
      date: parsed.date,
      start_time: parsed.startTime,
      end_time: parsed.endTime,
      city: parsed.city || null,
      status: computeStatus(parsed.staffCategory, parsed.staffPerson) as TastingStatus,
      staff_category: parsed.staffCategory || null,
      staff_person: parsed.staffPerson || null,
      notes: parsed.notes || null,
      created_by: user.id,
    };
  });

  const { data, error } = await supabase
    .from('tastings')
    .insert(rows)
    .select(TASTING_SELECT);

  if (error) throw error;
  revalidatePath('/admin/tastings');
  return data ?? [];
}

// ---------- Update ----------

export async function updateTasting(
  id: string,
  input: {
    agencyId?: string;
    date?: string;
    startTime?: string;
    endTime?: string;
    city?: string;
    staffCategory?: string;
    staffPerson?: string;
    notes?: string;
    status?: string;
  }
) {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = {};
  if (input.agencyId) updates.agency_id = input.agencyId;
  if (input.date) updates.date = input.date;
  if (input.startTime) updates.start_time = input.startTime;
  if (input.endTime) updates.end_time = input.endTime;
  if ('city' in input) updates.city = input.city || null;
  if ('staffCategory' in input) updates.staff_category = input.staffCategory || null;
  if ('staffPerson' in input) updates.staff_person = input.staffPerson || null;
  if ('notes' in input) updates.notes = input.notes || null;

  if (input.status) {
    updates.status = input.status;
  } else if ('staffCategory' in input || 'staffPerson' in input) {
    updates.status = computeStatus(
      'staffCategory' in input ? input.staffCategory : undefined,
      'staffPerson' in input ? input.staffPerson : undefined
    );
  }

  const { error } = await supabase
    .from('tastings')
    .update(updates)
    .eq('id', id);
  if (error) throw error;

  revalidatePath('/admin/tastings');
}

// ---------- Complete ----------

export async function completeTasting(
  id: string,
  { notes, reportUrl }: { notes?: string; reportUrl?: string }
) {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = { status: 'completed' };
  if (notes) updates.notes = notes;
  if (reportUrl) updates.report_url = reportUrl;

  const { error } = await supabase
    .from('tastings')
    .update(updates)
    .eq('id', id);
  if (error) throw error;

  revalidatePath('/admin/tastings');
}

// ---------- Cancel ----------

export async function cancelTasting(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('tastings')
    .update({ status: 'cancelled' })
    .eq('id', id);
  if (error) throw error;
  revalidatePath('/admin/tastings');
}

// ---------- Delete ----------

export async function deleteTasting(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('tastings')
    .delete()
    .eq('id', id);
  if (error) throw error;
  revalidatePath('/admin/tastings');
}
