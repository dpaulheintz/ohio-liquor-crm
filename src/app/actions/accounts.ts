'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function getAccounts({
  search,
  type,
  district,
  repId,
  neverVisited,
  needsReview,
  page = 1,
  pageSize = 20,
  sortBy = 'display_name',
  sortOrder = 'asc',
}: {
  search?: string;
  type?: 'agency' | 'wholesale';
  district?: string;
  repId?: string;
  neverVisited?: boolean;
  needsReview?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
} = {}) {
  const supabase = await createClient();

  let query = supabase
    .from('accounts')
    .select(
      `*, owner_rep:profiles!accounts_owner_rep_id_fkey(id, full_name, email)`,
      { count: 'exact' }
    );

  if (search) {
    query = query.or(
      `display_name.ilike.%${search}%,agency_id.ilike.%${search}%,permit_number.ilike.%${search}%`
    );
  }

  if (type) {
    query = query.eq('type', type);
  }

  if (district) {
    query = query.eq('district', district);
  }

  if (repId) {
    query = query.eq('owner_rep_id', repId);
  }

  if (needsReview) {
    query = query.eq('needs_review', true);
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  query = query.order(sortBy, { ascending: sortOrder === 'asc' }).range(from, to);

  const { data, count, error } = await query;

  if (error) throw error;

  // If neverVisited filter is on, we need to filter client-side after
  // checking which accounts have visits. For MVP, this is acceptable.
  if (neverVisited && data) {
    const accountIds = data.map((a) => a.id);
    const { data: visited } = await supabase
      .from('visit_logs')
      .select('account_id')
      .in('account_id', accountIds);
    const visitedIds = new Set(visited?.map((v) => v.account_id) ?? []);
    return {
      accounts: data.filter((a) => !visitedIds.has(a.id)),
      total: count ?? 0,
    };
  }

  return { accounts: data ?? [], total: count ?? 0 };
}

export async function getAccount(id: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('accounts')
    .select(
      `*, owner_rep:profiles!accounts_owner_rep_id_fkey(id, full_name, email)`
    )
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function createAccount(formData: FormData) {
  const supabase = await createClient();

  const type = formData.get('type') as string;
  const account = {
    type,
    display_name: formData.get('display_name') as string,
    legal_name: (formData.get('legal_name') as string) || null,
    agency_id: type === 'agency' ? (formData.get('agency_id') as string) || null : null,
    permit_number: type === 'wholesale' ? (formData.get('permit_number') as string) || null : null,
    district: (formData.get('district') as string) || null,
    address: (formData.get('address') as string) || null,
    city: (formData.get('city') as string) || null,
    zip: (formData.get('zip') as string) || null,
    phone: (formData.get('phone') as string) || null,
  };

  const { data, error } = await supabase
    .from('accounts')
    .insert(account)
    .select()
    .single();

  if (error) throw error;

  revalidatePath('/accounts');
  return data;
}

export async function updateAccount(id: string, formData: FormData) {
  const supabase = await createClient();

  const type = formData.get('type') as string;
  const updates = {
    display_name: formData.get('display_name') as string,
    legal_name: (formData.get('legal_name') as string) || null,
    agency_id: type === 'agency' ? (formData.get('agency_id') as string) || null : null,
    permit_number: type === 'wholesale' ? (formData.get('permit_number') as string) || null : null,
    district: (formData.get('district') as string) || null,
    address: (formData.get('address') as string) || null,
    city: (formData.get('city') as string) || null,
    zip: (formData.get('zip') as string) || null,
    phone: (formData.get('phone') as string) || null,
  };

  const { error } = await supabase
    .from('accounts')
    .update(updates)
    .eq('id', id);

  if (error) throw error;

  revalidatePath(`/accounts/${id}`);
  revalidatePath('/accounts');
}

export async function claimAccount(accountId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('accounts')
    .update({ owner_rep_id: user.id })
    .eq('id', accountId);

  if (error) throw error;
  revalidatePath(`/accounts/${accountId}`);
  revalidatePath('/accounts');
}

export async function releaseAccount(accountId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('accounts')
    .update({ owner_rep_id: null })
    .eq('id', accountId);

  if (error) throw error;
  revalidatePath(`/accounts/${accountId}`);
  revalidatePath('/accounts');
}

export async function approveAccount(accountId: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('accounts')
    .update({ needs_review: false })
    .eq('id', accountId);

  if (error) throw error;
  revalidatePath(`/accounts/${accountId}`);
  revalidatePath('/accounts');
  revalidatePath('/admin/approvals');
}

export async function getDistricts() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('accounts')
    .select('district')
    .not('district', 'is', null)
    .order('district');

  const unique = [...new Set(data?.map((d) => d.district).filter(Boolean))];
  return unique as string[];
}

export async function getReps() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('role', ['rep', 'admin'])
    .order('full_name');

  return data ?? [];
}

export async function searchAccounts(query: string) {
  const supabase = await createClient();

  const { data } = await supabase
    .from('accounts')
    .select('id, display_name, type, district')
    .ilike('display_name', `%${query}%`)
    .limit(10);

  return data ?? [];
}
