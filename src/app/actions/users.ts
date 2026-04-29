'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function assertAdmin(supabase: SupabaseServerClient) {
  const { data: me } = await supabase.auth.getUser();
  if (!me.user) throw new Error('Not authenticated');

  // Use the SECURITY DEFINER RPCs as the source of truth — bypasses RLS
  // on the profiles table and handles both org-admin and super_admin roles.
  const [adminRes, superAdminRes] = await Promise.all([
    supabase.rpc('is_admin'),
    supabase.rpc('is_super_admin'),
  ]);

  if (adminRes.data !== true && superAdminRes.data !== true) {
    throw new Error('Admin only');
  }

  return me.user.id;
}

export async function getProfiles() {
  const supabase = await createClient();
  await assertAdmin(supabase);

  // RLS policy scopes this to profiles within the caller's org automatically.
  // Super admins see all orgs (intentional — they manage everything).
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
  const callerId = await assertAdmin(supabase);

  // Ensure the user being updated is in the caller's org (or caller is super_admin)
  // If they have no org yet (newly approved), enroll them in the admin's org
  await ensureUserInAdminOrg(supabase, callerId, userId);

  const { error } = await supabase
    .from('profiles')
    .update({ role, is_approved: true })
    .eq('id', userId);

  if (error) throw error;
  revalidatePath('/admin/users');
}

export async function approveUser(userId: string) {
  const supabase = await createClient();
  const callerId = await assertAdmin(supabase);

  // Enroll the user in the admin's org if not already assigned
  await ensureUserInAdminOrg(supabase, callerId, userId);

  const { error } = await supabase
    .from('profiles')
    .update({ is_approved: true })
    .eq('id', userId);

  if (error) throw error;
  revalidatePath('/admin/users');
  revalidatePath('/admin/approvals');
}

/**
 * If the target user has no organization_id, assign them to the same org as
 * the calling admin and add them to organization_members. This handles new
 * signups that arrive before any org context is set.
 */
async function ensureUserInAdminOrg(
  supabase: SupabaseServerClient,
  adminUserId: string,
  targetUserId: string
) {
  // Get the admin's org
  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', adminUserId)
    .maybeSingle();

  const orgId = adminProfile?.organization_id;
  if (!orgId) return; // super_admin with no org, or org not configured — skip

  // Check if target already has an org
  const { data: targetProfile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', targetUserId)
    .maybeSingle();

  if (targetProfile?.organization_id) return; // already assigned, nothing to do

  // Assign to admin's org
  await supabase
    .from('profiles')
    .update({ organization_id: orgId })
    .eq('id', targetUserId);

  // Add to organization_members
  await supabase
    .from('organization_members')
    .insert({ organization_id: orgId, user_id: targetUserId, role: 'rep' })
    .throwOnError();
}
