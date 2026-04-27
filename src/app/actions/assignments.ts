'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const ASSIGNMENT_SELECT = `
  id, account_id, assigned_to, assigned_by, notes, status, created_at, completed_at,
  account:accounts!assignments_account_id_fkey(id, display_name, city, type),
  rep:profiles!assignments_assigned_to_fkey(id, full_name, email),
  assigner:profiles!assignments_assigned_by_fkey(id, full_name, email)
`.trim();

// ---------- Read ----------

export async function getMyAssignments() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('assignments')
    .select(ASSIGNMENT_SELECT)
    .eq('assigned_to', user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getAllAssignments({
  repId,
  status,
  page = 1,
  pageSize = 30,
}: {
  repId?: string;
  status?: 'pending' | 'completed' | 'all';
  page?: number;
  pageSize?: number;
} = {}) {
  const supabase = await createClient();

  let query = supabase
    .from('assignments')
    .select(ASSIGNMENT_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false });

  if (repId) query = query.eq('assigned_to', repId);
  if (status && status !== 'all') query = query.eq('status', status);

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, count, error } = await query;
  if (error) throw error;
  return { assignments: data ?? [], total: count ?? 0 };
}

// ---------- Create ----------

const createAssignmentSchema = z.object({
  accountId: z.string().uuid(),
  assignedTo: z.string().uuid(),
  notes: z.string().max(1000).optional(),
});

export async function createAssignment(input: {
  accountId: string;
  assignedTo: string;
  notes?: string;
}) {
  const parsed = createAssignmentSchema.parse(input);
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: isAdminData, error: isAdminErr } = await supabase.rpc('is_admin');
  if (isAdminErr) throw new Error('Permission check failed');
  if (isAdminData !== true) throw new Error('Admin only');

  const { data, error } = await supabase
    .from('assignments')
    .insert({
      account_id: parsed.accountId,
      assigned_to: parsed.assignedTo,
      assigned_by: user.id,
      notes: parsed.notes || null,
      status: 'pending',
    })
    .select(ASSIGNMENT_SELECT)
    .single();

  if (error) throw error;

  revalidatePath('/admin/assignments');
  revalidatePath('/assignments');
  return data;
}

// ---------- Complete ----------

export async function completeAssignment(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('assignments')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', id);

  if (error) throw error;

  revalidatePath('/assignments');
  revalidatePath('/admin/assignments');
}

// ---------- Auto-complete on visit ----------

/**
 * Called after a visit is created. Marks any pending assignments for the
 * visited account (assigned to the current rep) as completed.
 */
export async function autoCompleteAssignmentsForVisit(accountId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from('assignments')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('account_id', accountId)
    .eq('assigned_to', user.id)
    .eq('status', 'pending');

  if (error) console.error('auto-complete assignments failed:', error);
  // Non-fatal: visit is already saved
}

// ---------- Delete ----------

export async function deleteAssignment(id: string) {
  const supabase = await createClient();

  const { data: isAdminData, error: isAdminErr } = await supabase.rpc('is_admin');
  if (isAdminErr) throw new Error('Permission check failed');
  if (isAdminData !== true) throw new Error('Admin only');

  const { error } = await supabase
    .from('assignments')
    .delete()
    .eq('id', id);

  if (error) throw error;

  revalidatePath('/admin/assignments');
  revalidatePath('/assignments');
}
