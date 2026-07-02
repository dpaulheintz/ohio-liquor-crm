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

export async function getBarrels(): Promise<BarrelWithMilestones[]> {
  const supabase = await createClient();
  const [{ data: barrels, error: be }, { data: milestones, error: me }] = await Promise.all([
    supabase.from('eos_barrels').select('*').order('barrel_type').order('created_at'),
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
