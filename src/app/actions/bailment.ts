'use server';

import { createAdminClient } from '@/lib/supabase/server';

export interface BailmentEntry {
  id: string;
  month: string;
  amount: number;
}

/** Fetch all bailment rows, newest first. */
export async function getBailmentEntries(): Promise<BailmentEntry[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('bailment_monthly')
    .select('id, month, amount')
    .order('month', { ascending: false });
  if (error) throw new Error(`Failed to load bailment data: ${error.message}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => ({
    id:     String(r.id),
    month:  String(r.month),
    amount: Number(r.amount),
  }));
}

/** Upsert a single month's bailment amount. */
export async function upsertBailment(month: string, amount: number): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('bailment_monthly')
    .upsert({ month, amount, updated_at: new Date().toISOString() }, { onConflict: 'month' });
  if (error) throw new Error(`Failed to save bailment: ${error.message}`);
}
