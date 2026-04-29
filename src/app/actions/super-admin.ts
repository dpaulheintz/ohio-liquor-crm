'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  return createAdminClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function assertSuperAdmin() {
  const supabase = await createClient();
  const { data: flag, error } = await supabase.rpc('is_super_admin');
  if (error || flag !== true) throw new Error('Super admin only');
  return supabase;
}

// ---------------------------------------------------------------------------
// Global Stats
// ---------------------------------------------------------------------------

export interface GlobalStats {
  totalOrgs: number;
  activeOrgs: number;
  totalUsers: number;
  totalVisits: number;
  totalAccounts: number;
  totalAgencies: number;
  orgsBreakdown: {
    id: string;
    name: string;
    slug: string;
    is_active: boolean;
    userCount: number;
    visitCount: number;
    accountCount: number;
  }[];
}

export async function getGlobalStats(): Promise<GlobalStats> {
  await assertSuperAdmin();
  const admin = getServiceClient();

  const [orgsRes, profilesRes, visitsRes, accountsRes, agenciesRes] =
    await Promise.all([
      admin.from('organizations').select('id, name, slug, is_active'),
      admin.from('profiles').select('id, organization_id, role'),
      admin
        .from('visit_logs')
        .select('id, organization_id')
        .gte('visited_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),
      admin.from('accounts').select('id, organization_id').not('organization_id', 'is', null),
      admin.from('accounts').select('id').is('organization_id', null).eq('type', 'agency'),
    ]);

  const orgs = orgsRes.data ?? [];
  const profiles = profilesRes.data ?? [];
  const visits = visitsRes.data ?? [];
  const accounts = accountsRes.data ?? [];
  const agencies = agenciesRes.data ?? [];

  const orgsBreakdown = orgs.map((org) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    is_active: org.is_active,
    userCount: profiles.filter((p) => p.organization_id === org.id).length,
    visitCount: visits.filter((v) => v.organization_id === org.id).length,
    accountCount: accounts.filter((a) => a.organization_id === org.id).length,
  }));

  return {
    totalOrgs: orgs.length,
    activeOrgs: orgs.filter((o) => o.is_active).length,
    totalUsers: profiles.length,
    totalVisits: visits.length,
    totalAccounts: accounts.length,
    totalAgencies: agencies.length,
    orgsBreakdown,
  };
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

export async function getAllOrganizations() {
  await assertSuperAdmin();
  const admin = getServiceClient();

  const { data, error } = await admin
    .from('organizations')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getOrgDetail(orgId: string) {
  await assertSuperAdmin();
  const admin = getServiceClient();

  const [orgRes, usersRes, visitsRes, accountsRes, recentVisitsRes] =
    await Promise.all([
      admin.from('organizations').select('*').eq('id', orgId).single(),
      admin
        .from('profiles')
        .select('id, email, full_name, role, is_approved, is_super_admin, created_at')
        .eq('organization_id', orgId)
        .order('created_at'),
      admin
        .from('visit_logs')
        .select('id, visited_at, organization_id')
        .eq('organization_id', orgId),
      admin
        .from('accounts')
        .select('id, type, organization_id')
        .eq('organization_id', orgId),
      admin
        .from('visit_logs')
        .select(
          'id, visited_at, notes, kpi, rep:profiles!visit_logs_rep_id_fkey(full_name, email), account:accounts!visit_logs_account_id_fkey(display_name)'
        )
        .eq('organization_id', orgId)
        .order('visited_at', { ascending: false })
        .limit(10),
    ]);

  if (orgRes.error || !orgRes.data) throw new Error('Organization not found');

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const visits = visitsRes.data ?? [];

  return {
    org: orgRes.data,
    users: usersRes.data ?? [],
    totalVisits: visits.length,
    visitsThisWeek: visits.filter((v) => new Date(v.visited_at) >= weekAgo).length,
    visitsThisMonth: visits.filter((v) => new Date(v.visited_at) >= monthAgo).length,
    accountCount: accountsRes.data?.length ?? 0,
    recentVisits: recentVisitsRes.data ?? [],
  };
}

export async function createOrganization(data: {
  name: string;
  slug: string;
  adminEmail: string;
  adminTempPassword: string;
  adminFullName?: string;
}) {
  await assertSuperAdmin();
  const admin = getServiceClient();

  // 1. Create the org
  const { data: org, error: orgErr } = await admin
    .from('organizations')
    .insert({ name: data.name, slug: data.slug.toLowerCase().trim(), is_active: true })
    .select()
    .single();

  if (orgErr) throw new Error(`Failed to create org: ${orgErr.message}`);

  // 2. Create the first admin user via the auth admin API
  //    handle_new_user() trigger will fire and create the profile
  const { data: newUser, error: userErr } = await admin.auth.admin.createUser({
    email: data.adminEmail,
    password: data.adminTempPassword,
    email_confirm: true,
    user_metadata: {
      full_name: data.adminFullName ?? null,
      organization_id: org.id,
    },
  });

  if (userErr) {
    // Roll back org creation
    await admin.from('organizations').delete().eq('id', org.id);
    throw new Error(`Failed to create admin user: ${userErr.message}`);
  }

  // 3. Promote the new user to admin (trigger creates them as 'pending')
  await admin
    .from('profiles')
    .update({ role: 'admin', is_approved: true })
    .eq('id', newUser.user.id);

  // 4. Add to organization_members
  await admin.from('organization_members').insert({
    organization_id: org.id,
    user_id: newUser.user.id,
    role: 'admin',
  });

  revalidatePath('/super-admin/organizations');
  return { org, userId: newUser.user.id };
}

export async function toggleOrgActive(orgId: string, isActive: boolean) {
  await assertSuperAdmin();
  const admin = getServiceClient();

  const { error } = await admin
    .from('organizations')
    .update({ is_active: isActive })
    .eq('id', orgId);

  if (error) throw error;
  revalidatePath('/super-admin/organizations');
  revalidatePath(`/super-admin/organizations/${orgId}`);
}

// ---------------------------------------------------------------------------
// Shared Agencies (organization_id = NULL)
// ---------------------------------------------------------------------------

export async function getSharedAgencies({
  search,
  page = 1,
  pageSize = 30,
}: {
  search?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  await assertSuperAdmin();
  const admin = getServiceClient();

  let query = admin
    .from('accounts')
    .select('id, display_name, address, city, state, zip, phone, warehouse, delivery_day, agency_id', { count: 'exact' })
    .eq('type', 'agency')
    .is('organization_id', null)
    .order('display_name');

  if (search) query = query.ilike('display_name', `%${search}%`);

  const from = (page - 1) * pageSize;
  query = query.range(from, from + pageSize - 1);

  const { data, count, error } = await query;
  if (error) throw error;

  return { agencies: data ?? [], total: count ?? 0 };
}

export async function createSharedAgency(data: {
  display_name: string;
  agency_id?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  warehouse?: string;
  delivery_day?: string;
}) {
  await assertSuperAdmin();
  const admin = getServiceClient();

  const { data: agency, error } = await admin
    .from('accounts')
    .insert({
      ...data,
      type: 'agency',
      organization_id: null,
      status: 'customer',
    })
    .select()
    .single();

  if (error) throw error;
  revalidatePath('/super-admin/agencies');
  return agency;
}

export async function updateSharedAgency(
  id: string,
  data: {
    display_name?: string;
    agency_id?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    phone?: string;
    warehouse?: string;
    delivery_day?: string;
  }
) {
  await assertSuperAdmin();
  const admin = getServiceClient();

  const { error } = await admin
    .from('accounts')
    .update(data)
    .eq('id', id)
    .is('organization_id', null)
    .eq('type', 'agency');

  if (error) throw error;
  revalidatePath('/super-admin/agencies');
}

export async function deleteSharedAgency(id: string) {
  await assertSuperAdmin();
  const admin = getServiceClient();

  const { error } = await admin
    .from('accounts')
    .delete()
    .eq('id', id)
    .is('organization_id', null)
    .eq('type', 'agency');

  if (error) throw error;
  revalidatePath('/super-admin/agencies');
}

// ---------------------------------------------------------------------------
// All Users (cross-org)
// ---------------------------------------------------------------------------

export async function getAllUsers() {
  await assertSuperAdmin();
  const admin = getServiceClient();

  const { data, error } = await admin
    .from('profiles')
    .select(
      'id, email, full_name, role, is_approved, is_super_admin, organization_id, created_at, organizations!profiles_organization_id_fkey(name, slug)'
    )
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Impersonation (cookie-based)
// ---------------------------------------------------------------------------

export async function startImpersonation(orgId: string, orgName: string) {
  await assertSuperAdmin();
  const cookieStore = await cookies();
  cookieStore.set('sa_impersonate_org_id', orgId, { httpOnly: true, path: '/', maxAge: 60 * 60 * 4 });
  cookieStore.set('sa_impersonate_org_name', orgName, { httpOnly: false, path: '/', maxAge: 60 * 60 * 4 });
}

export async function stopImpersonation() {
  const cookieStore = await cookies();
  cookieStore.delete('sa_impersonate_org_id');
  cookieStore.delete('sa_impersonate_org_name');
}
