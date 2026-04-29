'use server';

import { createClient } from '@/lib/supabase/server';
import { Organization } from '@/lib/types';

/**
 * Returns the organization record for the currently authenticated user.
 * Returns null if the user has no org (e.g. pending/unassigned user).
 */
export async function getMyOrg(): Promise<Organization | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Get org_id from the user's profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.organization_id) return null;

  const { data: org, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', profile.organization_id)
    .maybeSingle();

  if (error) {
    console.error('[getMyOrg] failed', error);
    return null;
  }

  return org as Organization | null;
}

/**
 * Returns all organizations (super_admin only).
 */
export async function getAllOrgs(): Promise<Organization[]> {
  const supabase = await createClient();

  const { data: isSuperAdmin } = await supabase.rpc('is_super_admin');
  if (!isSuperAdmin) throw new Error('Super admin only');

  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .order('name');

  if (error) throw error;
  return (data ?? []) as Organization[];
}
