'use server';

import { createClient } from '@/lib/supabase/server';

export async function getProfiles() {
  const supabase = await createClient();
  const { data: me } = await supabase.auth.getUser();
  if (!me.user) throw new Error('Not authenticated');

  // Check admin
  const { data: myProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', me.user.id)
    .single();

  if (myProfile?.role !== 'admin') throw new Error('Admin only');

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
}

const VALID_ROLES = ['admin', 'rep', 'viewer'] as const;

export async function updateProfileRole(userId: string, role: 'admin' | 'rep' | 'viewer') {
  if (!VALID_ROLES.includes(role)) {
    throw new Error(`Invalid role: ${role}`);
  }

  const supabase = await createClient();
  const { data: me } = await supabase.auth.getUser();
  if (!me.user) throw new Error('Not authenticated');

  const { data: myProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', me.user.id)
    .single();

  if (myProfile?.role !== 'admin') throw new Error('Admin only');

  const { error } = await supabase
    .from('profiles')
    .update({ role, is_approved: true })
    .eq('id', userId);

  if (error) throw error;
}

export async function approveUser(userId: string) {
  const supabase = await createClient();
  const { data: me } = await supabase.auth.getUser();
  if (!me.user) throw new Error('Not authenticated');

  const { data: myProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', me.user.id)
    .single();

  if (myProfile?.role !== 'admin') throw new Error('Admin only');

  const { error } = await supabase
    .from('profiles')
    .update({ is_approved: true })
    .eq('id', userId);

  if (error) throw error;
}
