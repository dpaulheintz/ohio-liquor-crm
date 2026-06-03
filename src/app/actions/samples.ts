'use server';

import { createAdminClient } from '@/lib/supabase/server';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SamplePullInput {
  pull_type: 'spirits' | 'swag';
  person_name: string;
  category: string;
  account_name?: string | null;
  notes?: string | null;
  items: {
    item_name: string;
    item_category?: string | null;
    size?: string | null;
    quantity: number;
  }[];
}

export interface SamplePullRow {
  id: string;
  pull_type: 'spirits' | 'swag';
  person_name: string;
  category: string;
  account_name: string | null;
  notes: string | null;
  created_at: string;
  items: {
    id: string;
    item_name: string;
    item_category: string | null;
    size: string | null;
    quantity: number;
  }[];
}

// ─── Public: submit a sample pull (no auth required) ──────────────────────────

export async function submitSamplePull(input: SamplePullInput): Promise<void> {
  const supabase = createAdminClient();

  // Insert the pull header
  const { data: pull, error: pullErr } = await supabase
    .from('sample_pulls')
    .insert({
      pull_type: input.pull_type,
      person_name: input.person_name.trim(),
      category: input.category,
      account_name: input.account_name?.trim() || null,
      notes: input.notes?.trim() || null,
    })
    .select('id')
    .single();

  if (pullErr) throw new Error(`Failed to save sample pull: ${pullErr.message}`);

  // Insert line items
  if (input.items.length > 0) {
    const { error: itemErr } = await supabase
      .from('sample_pull_items')
      .insert(
        input.items.map((item) => ({
          pull_id: pull.id,
          item_name: item.item_name,
          item_category: item.item_category || null,
          size: item.size || null,
          quantity: item.quantity,
        }))
      );
    if (itemErr) throw new Error(`Failed to save items: ${itemErr.message}`);
  }
}

// ─── Admin: fetch all sample pulls with items ─────────────────────────────────

export async function getSamplePulls(): Promise<SamplePullRow[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('sample_pulls')
    .select('id, pull_type, person_name, category, account_name, notes, created_at, sample_pull_items(id, item_name, item_category, size, quantity)')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to load samples: ${error.message}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id: r.id,
    pull_type: r.pull_type,
    person_name: r.person_name,
    category: r.category,
    account_name: r.account_name,
    notes: r.notes,
    created_at: r.created_at,
    items: (r.sample_pull_items ?? []).map((i: any) => ({
      id: i.id,
      item_name: i.item_name,
      item_category: i.item_category,
      size: i.size,
      quantity: i.quantity,
    })),
  }));
}
