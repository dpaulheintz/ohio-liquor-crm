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

/** Today as YYYY-MM-DD (local), for comparing against DATE columns. */
function todayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Last day (YYYY-MM-DD) of a barrel's quarter, parsed from a "Q<n> YYYY" label
 * (e.g. "Q2 2026" → "2026-06-30"). Returns null when the label isn't parseable.
 */
export function quarterEndDate(quarter: string | null): string | null {
  if (!quarter) return null;
  const m = quarter.match(/Q\s*([1-4])\s*[-/ ]?\s*(\d{4})/i);
  if (!m) return null;
  const ends: Record<string, string> = { '1': '03-31', '2': '06-30', '3': '09-30', '4': '12-31' };
  return `${m[2]}-${ends[m[1]]}`;
}

/**
 * A barrel is archived once its quarter has fully passed. The quarter label is
 * the source of truth (so barrels auto-move to the archive when the quarter
 * ends, even if no due_date was ever set); if there's no parseable quarter we
 * fall back to due_date. A barrel with neither is never auto-archived.
 *
 * @param archived  false (default) = active (current/future quarter, or undated);
 *                  true = archived (quarter/ due_date strictly before today).
 */
export async function getBarrels(archived = false): Promise<BarrelWithMilestones[]> {
  const supabase = await createClient();
  const today = todayDateStr();
  const [{ data: barrels, error: be }, { data: milestones, error: me }] = await Promise.all([
    supabase.from('eos_barrels').select('*').order('barrel_type').order('created_at'),
    supabase.from('eos_barrel_milestones').select('*').order('display_order').order('created_at'),
  ]);
  if (be) throw be;
  if (me) throw me;

  const isArchived = (b: Barrel): boolean => {
    const end = quarterEndDate(b.quarter) ?? b.due_date;
    return end != null && end < today;
  };
  const visible = (barrels ?? []).filter((b) => isArchived(b as Barrel) === archived);

  const byBarrelId = new Map<string, Milestone[]>();
  for (const m of milestones ?? []) {
    const arr = byBarrelId.get(m.barrel_id) ?? [];
    arr.push(m as Milestone);
    byBarrelId.set(m.barrel_id, arr);
  }

  return visible.map(b => ({
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
