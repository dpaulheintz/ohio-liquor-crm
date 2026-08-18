'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import {
  BARREL_DEFAULTS,
  CHECKLIST_STEPS,
  type BarrelPick,
  type BarrelType,
  type CustomerType,
  type PipelineStage,
} from './barrel-pick-constants';

const LIST_SELECT = `
  id, customer_name, customer_type, contact_name, contact_email, contact_phone,
  barrel_type, is_half_barrel, price_per_bottle, expected_yield, actual_yield,
  total_value, status, pick_date, barrel_selected, bottling_date, delivery_date,
  rep_id, created_by, created_at, updated_at,
  rep:profiles!barrel_picks_rep_id_fkey(id, full_name, email),
  creator:profiles!barrel_picks_created_by_fkey(id, full_name)
`.trim();

const DETAIL_SELECT = `
  ${LIST_SELECT},
  checklist:barrel_pick_checklist(id, barrel_pick_id, step, status, completed_at, completed_by, notes,
    completer:profiles!barrel_pick_checklist_completed_by_fkey(full_name)),
  notes:barrel_pick_notes(id, barrel_pick_id, author_id, content, created_at,
    author:profiles!barrel_pick_notes_author_id_fkey(full_name))
`.trim();

// ─── Read ───────────────────────────────────────────────────────────────────

export async function getBarrelPicks(filters?: {
  status?: string;
  barrelType?: string;
  customerType?: string;
  repId?: string;
}) {
  const supabase = await createClient();
  let query = supabase
    .from('barrel_picks')
    .select(LIST_SELECT)
    .order('created_at', { ascending: false });

  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.barrelType) query = query.eq('barrel_type', filters.barrelType);
  if (filters?.customerType) query = query.eq('customer_type', filters.customerType);
  if (filters?.repId) query = query.eq('rep_id', filters.repId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as BarrelPick[];
}

export async function getBarrelPick(id: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('barrel_picks')
    .select(DETAIL_SELECT)
    .eq('id', id)
    .single();

  if (error) throw error;

  const pick = data as unknown as BarrelPick;
  if (pick.checklist) {
    const stepOrder = CHECKLIST_STEPS as readonly string[];
    pick.checklist.sort((a, b) => stepOrder.indexOf(a.step) - stepOrder.indexOf(b.step));
  }
  if (pick.notes) {
    pick.notes.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
  return pick;
}

export async function getBarrelPickStats() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('barrel_picks')
    .select('id, status, total_value, pick_date, created_at, updated_at');
  if (error) throw error;

  const all = data ?? [];
  const now = new Date();
  const yearStart = `${now.getFullYear()}-01-01`;
  const thirtyDaysOut = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);

  const active = all.filter(r => r.status !== 'completed' && r.status !== 'cancelled');
  const prospects = all.filter(r => r.status === 'prospect');
  const upcoming = all.filter(r =>
    r.status === 'scheduled' && r.pick_date && r.pick_date >= today && r.pick_date <= thirtyDaysOut
  );
  const inProd = all.filter(r => r.status === 'in_production');
  const pipeline = active.reduce((s, r) => s + Number(r.total_value ?? 0), 0);
  const ytdCompleted = all.filter(r => r.status === 'completed' && r.updated_at >= yearStart);
  const ytdRevenue = ytdCompleted.reduce((s, r) => s + Number(r.total_value ?? 0), 0);

  return {
    active: active.length,
    prospects: prospects.length,
    upcomingPicks: upcoming.length,
    inProduction: inProd.length,
    pipeline,
    ytdCompleted: ytdCompleted.length,
    ytdRevenue,
  };
}

// ─── Write ──────────────────────────────────────────────────────────────────

export async function createBarrelPick(input: {
  customer_name: string;
  customer_type: CustomerType;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  barrel_type?: BarrelType | null;
  is_half_barrel?: boolean;
  price_per_bottle?: number;
  expected_yield?: number;
  pick_date?: string;
  rep_id?: string;
  initial_notes?: string;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const defaults = input.barrel_type ? BARREL_DEFAULTS[input.barrel_type] : null;
  const isHalf = defaults ? input.is_half_barrel && defaults.halfYield !== null : false;
  const price = input.price_per_bottle ?? defaults?.price ?? null;
  const yield_ = input.expected_yield ?? (isHalf && defaults ? defaults.halfYield! : defaults?.fullYield ?? null);
  const status = input.pick_date ? 'scheduled' : 'prospect';

  const { data, error } = await supabase
    .from('barrel_picks')
    .insert({
      customer_name: input.customer_name,
      customer_type: input.customer_type,
      contact_name: input.contact_name || null,
      contact_email: input.contact_email || null,
      contact_phone: input.contact_phone || null,
      barrel_type: input.barrel_type || null,
      is_half_barrel: isHalf || null,
      price_per_bottle: price,
      expected_yield: yield_,
      status,
      pick_date: input.pick_date || null,
      rep_id: input.rep_id || null,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error) throw error;

  const checklistRows = CHECKLIST_STEPS.map(step => ({
    barrel_pick_id: data.id,
    step,
    status: 'not_started' as const,
  }));
  const { error: clErr } = await supabase
    .from('barrel_pick_checklist')
    .insert(checklistRows);
  if (clErr) throw clErr;

  if (input.initial_notes?.trim()) {
    const { error: nErr } = await supabase
      .from('barrel_pick_notes')
      .insert({
        barrel_pick_id: data.id,
        author_id: user.id,
        content: input.initial_notes.trim(),
      });
    if (nErr) throw nErr;
  }

  revalidatePath('/admin/barrel-picks');
  return data.id;
}

export async function updateBarrelPick(id: string, updates: {
  customer_name?: string;
  customer_type?: CustomerType;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  barrel_type?: BarrelType | null;
  is_half_barrel?: boolean | null;
  price_per_bottle?: number | null;
  expected_yield?: number | null;
  actual_yield?: number | null;
  status?: PipelineStage;
  pick_date?: string | null;
  barrel_selected?: string | null;
  bottling_date?: string | null;
  delivery_date?: string | null;
  rep_id?: string | null;
}) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('barrel_picks')
    .update(updates)
    .eq('id', id);
  if (error) throw error;
  revalidatePath('/admin/barrel-picks');
}

export async function updateBarrelPickStatus(id: string, status: PipelineStage) {
  return updateBarrelPick(id, { status });
}

// ─── Checklist ──────────────────────────────────────────────────────────────

export async function updateChecklistItem(itemId: string, updates: {
  status?: 'not_started' | 'in_progress' | 'completed';
  notes?: string | null;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const payload: Record<string, unknown> = { ...updates };
  if (updates.status === 'completed') {
    payload.completed_at = new Date().toISOString();
    payload.completed_by = user?.id ?? null;
  } else if (updates.status) {
    payload.completed_at = null;
    payload.completed_by = null;
  }

  const { error } = await supabase
    .from('barrel_pick_checklist')
    .update(payload)
    .eq('id', itemId);
  if (error) throw error;
  revalidatePath('/admin/barrel-picks');
}

// ─── Notes ──────────────────────────────────────────────────────────────────

export async function addBarrelPickNote(barrelPickId: string, content: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('barrel_pick_notes')
    .insert({
      barrel_pick_id: barrelPickId,
      author_id: user.id,
      content: content.trim(),
    });
  if (error) throw error;
  revalidatePath('/admin/barrel-picks');
}

export async function deleteBarrelPick(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('barrel_picks')
    .delete()
    .eq('id', id);
  if (error) throw error;
  revalidatePath('/admin/barrel-picks');
}
