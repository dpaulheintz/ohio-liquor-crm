import { createClient } from '@/lib/supabase/server';

export type Barrel = {
  id: string;
  title: string;
  description: string | null;
  owner_name: string | null;
  owner_email: string | null;
  status: 'not_started' | 'on_track' | 'off_track' | 'complete';
  due_date: string | null;
  quarter: string | null;
  barrel_type: 'company' | 'individual';
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Milestone = {
  id: string;
  barrel_id: string;
  title: string;
  completed: boolean;
  due_date: string | null;
  display_order: number;
  created_at: string;
};

export type BarrelWithMilestones = Barrel & { milestones: Milestone[] };

/** Today as YYYY-MM-DD (local), for comparing against the DATE column due_date. */
function todayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * @param archived  false (default) = active: due_date today-or-later, or no
 *                  due_date set (an undated barrel is not "past due"). true =
 *                  archived: due_date strictly before today (past quarter end).
 */
export async function getBarrels(archived = false): Promise<BarrelWithMilestones[]> {
  const supabase = await createClient();
  const today = todayDateStr();
  let barrelsQuery = supabase.from('eos_barrels').select('*').order('barrel_type').order('created_at');
  barrelsQuery = archived
    ? barrelsQuery.lt('due_date', today)
    : barrelsQuery.or(`due_date.gte.${today},due_date.is.null`);
  const [{ data: barrels, error: be }, { data: milestones, error: me }] = await Promise.all([
    barrelsQuery,
    supabase.from('eos_barrel_milestones').select('*').order('display_order').order('created_at'),
  ]);
  if (be) throw be;
  if (me) throw me;

  const byBarrelId = new Map<string, Milestone[]>();
  for (const m of milestones ?? []) {
    const arr = byBarrelId.get(m.barrel_id) ?? [];
    arr.push(m as Milestone);
    byBarrelId.set(m.barrel_id, arr);
  }

  return (barrels ?? []).map(b => ({
    ...(b as Barrel),
    milestones: byBarrelId.get(b.id) ?? [],
  }));
}

export async function createBarrel(data: {
  title: string;
  description?: string;
  owner_name?: string;
  owner_email?: string;
  status?: string;
  due_date?: string;
  quarter?: string;
  barrel_type?: string;
}): Promise<Barrel> {
  const supabase = await createClient();
  const { data: result, error } = await supabase
    .from('eos_barrels')
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return result as Barrel;
}

export async function updateBarrel(
  id: string,
  data: Partial<{
    title: string;
    description: string | null;
    owner_name: string | null;
    owner_email: string | null;
    status: string;
    due_date: string | null;
    quarter: string | null;
    barrel_type: string;
  }>,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('eos_barrels')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteBarrel(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('eos_barrels').delete().eq('id', id);
  if (error) throw error;
}

export async function createMilestone(
  barrelId: string,
  title: string,
  dueDate?: string,
): Promise<Milestone> {
  const supabase = await createClient();
  const { data: result, error } = await supabase
    .from('eos_barrel_milestones')
    .insert({ barrel_id: barrelId, title, due_date: dueDate ?? null })
    .select()
    .single();
  if (error) throw error;
  return result as Milestone;
}

export async function updateMilestone(
  id: string,
  data: Partial<{ title: string; completed: boolean; due_date: string | null }>,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('eos_barrel_milestones')
    .update(data)
    .eq('id', id);
  if (error) throw error;
}

export async function deleteMilestone(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('eos_barrel_milestones').delete().eq('id', id);
  if (error) throw error;
}
