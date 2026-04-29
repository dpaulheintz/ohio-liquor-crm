'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function assertAdmin(supabase: SupabaseServerClient) {
  const { data: me } = await supabase.auth.getUser();
  if (!me.user) throw new Error('Not authenticated');
  const { data: isAdminData, error } = await supabase.rpc('is_admin');
  if (error || isAdminData !== true) throw new Error('Admin only');
}

export async function getProfiles() {
  const supabase = await createClient();
  await assertAdmin(supabase);

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}

const VALID_ROLES = ['admin', 'rep'] as const;
type ValidRole = (typeof VALID_ROLES)[number];

export async function updateProfileRole(userId: string, role: ValidRole) {
  if (!VALID_ROLES.includes(role)) {
    throw new Error(`Invalid role: ${role}`);
  }

  const supabase = await createClient();
  await assertAdmin(supabase);

  const { error } = await supabase
    .from('profiles')
    .update({ role, is_approved: true })
    .eq('id', userId);

  if (error) throw error;
  revalidatePath('/admin/users');
}

export async function approveUser(userId: string) {
  const supabase = await createClient();
  await assertAdmin(supabase);

  const { error } = await supabase
    .from('profiles')
    .update({ role: 'rep', is_approved: true })
    .eq('id', userId);

  if (error) throw error;
  revalidatePath('/admin/users');
  revalidatePath('/admin/approvals');
}
