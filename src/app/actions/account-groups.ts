'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export interface AccountGroup {
  id: string;
  group_name: string;
  match_terms: string[];
  match_columns: 'wholesaler' | 'dba' | 'both';
  color: string;
  created_at: string;
}

export interface PreviewResult {
  count: number;
  samples: string[];
}

// Build a Supabase .or() filter string from terms × columns
function buildOrFilter(terms: string[], matchColumns: 'wholesaler' | 'dba' | 'both'): string {
  const cols =
    matchColumns === 'wholesaler'
      ? ['wholesaler_name']
      : matchColumns === 'dba'
      ? ['dba']
      : ['wholesaler_name', 'dba'];

  return terms
    .flatMap((t) =>
      cols.map((col) => `${col}.ilike.%${t.trim().replace(/%/g, '\\%')}%`)
    )
    .join(',');
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getAccountGroups(): Promise<AccountGroup[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('account_groups')
    .select('*')
    .order('group_name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as AccountGroup[];
}

// ─── Create / Update / Delete ─────────────────────────────────────────────────

export async function createAccountGroup(input: Omit<AccountGroup, 'id' | 'created_at'>) {
  const supabase = await createClient();
  const { error } = await supabase.from('account_groups').insert(input);
  if (error) throw error;
  revalidatePath('/admin/account-groups');
}

export async function updateAccountGroup(
  id: string,
  input: Omit<AccountGroup, 'id' | 'created_at'>
) {
  const supabase = await createClient();
  const { error } = await supabase.from('account_groups').update(input).eq('id', id);
  if (error) throw error;
  revalidatePath('/admin/account-groups');
}

export async function deleteAccountGroup(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('account_groups').delete().eq('id', id);
  if (error) throw error;
  revalidatePath('/admin/account-groups');
}

// ─── Live Preview ─────────────────────────────────────────────────────────────

export async function previewAccountGroup(
  terms: string[],
  matchColumns: 'wholesaler' | 'dba' | 'both'
): Promise<PreviewResult> {
  const cleanTerms = terms.map((t) => t.trim()).filter(Boolean);
  if (cleanTerms.length === 0) return { count: 0, samples: [] };

  const supabase = await createClient();
  const filter = buildOrFilter(cleanTerms, matchColumns);

  const [{ count }, { data }] = await Promise.all([
    supabase
      .from('wholesale_detail')
      .select('*', { count: 'exact', head: true })
      .or(filter),
    supabase
      .from('wholesale_detail')
      .select('wholesaler_name, dba')
      .or(filter)
      .limit(200),
  ]);

  // Collect unique business names from matching rows
  const names = new Set<string>();
  for (const row of data ?? []) {
    if (row.wholesaler_name && matchColumns !== 'dba') names.add(row.wholesaler_name);
    if (row.dba && matchColumns !== 'wholesaler') names.add(row.dba);
  }

  return {
    count: count ?? 0,
    samples: Array.from(names).sort().slice(0, 12),
  };
}
