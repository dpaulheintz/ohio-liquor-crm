'use server';

// "Scam or Legit?" fraud training — admin reads (CRM → Fraud Training). Admins only. The attempts table
// has no RLS policies, so reads go through the service role after an admin check (same as arcade).
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { quarterOf } from '@/lib/fraud-training/game';

export interface FraudAttemptRow {
  id: string;
  first_name: string;
  last_name: string;
  location: string;
  quarter: string;
  score: number;
  correct_count: number;
  total_count: number;
  percent: number;
  passed: boolean;
  badge: string;
  missed_card_ids: string[];
  dealt_card_ids: string[];
  completed_at: string;
  duration_seconds: number;
  completion_code: string;
}

export async function isFraudTrainingAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.rpc('is_admin');
  return data === true;
}

export async function getFraudTrainingData(quarter?: string): Promise<{ quarter: string; quarters: string[]; attempts: FraudAttemptRow[] }> {
  if (!(await isFraudTrainingAdmin())) throw new Error('Admin only');
  const db = createAdminClient();
  const current = quarterOf();
  const q = quarter && /^\d{4}-Q[1-4]$/.test(quarter) ? quarter : current;

  const { data: qs, error: qErr } = await db.from('fraud_training_attempts').select('quarter').limit(10000);
  if (qErr) throw new Error(qErr.message);
  const quarters = [...new Set([current, q, ...(qs ?? []).map((r) => r.quarter as string)])].sort().reverse();

  const { data, error } = await db
    .from('fraud_training_attempts')
    .select('id, first_name, last_name, location, quarter, score, correct_count, total_count, percent, passed, badge, missed_card_ids, dealt_card_ids, completed_at, duration_seconds, completion_code')
    .eq('quarter', q)
    .order('completed_at', { ascending: false })
    .limit(5000);
  if (error) throw new Error(error.message);
  return { quarter: q, quarters, attempts: (data ?? []).map((r) => ({ ...r, percent: Number(r.percent) })) as FraudAttemptRow[] };
}
