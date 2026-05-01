'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// Sanitize search terms for PostgREST .or() filter syntax
function sanitizeFilterValue(value: string): string {
  return value.replace(/[,()]/g, '');
}

const SEARCHABLE_FIELDS = [
  'display_name',
  'agency_id',
  'permit_number',
  'city',
  'legal_name',
  'address',
  'warehouse',
];

export async function getAccounts({
  search,
  type,
  district,
  repId,
  neverVisited,
  visitedSince,
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
  visitedSince?: string; // ISO date — filter to accounts visited on/after this date
  needsReview?: boolean;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
} = {}) {
  const supabase = await createClient();

  // Pre-fetch visited account IDs for neverVisited / visitedSince filters
  let visitedAccountIds: string[] | null = null;
  if (neverVisited) {
    const { data: visitedData } = await supabase
      .from('visit_logs')
      .select('account_id');
    visitedAccountIds = [
      ...new Set(visitedData?.map((v) => v.account_id) ?? []),
    ];
  }

  let visitedSinceIds: string[] | null = null;
  if (visitedSince) {
    const { data: visitedData } = await supabase
      .from('visit_logs')
      .select('account_id')
      .gte('visited_at', visitedSince);
    visitedSinceIds = [
      ...new Set(visitedData?.map((v) => v.account_id) ?? []),
    ];
  }

  let query = supabase
    .from('accounts')
    .select(
      `*, owner_rep:profiles!accounts_owner_rep_id_fkey(id, full_name, email)`,
      { count: 'exact' }
    );

  // Multi-term search: split input into words, each word must match at least
  // one searchable field. Multiple .or() calls are ANDed together.
  if (search) {
    const terms = search.trim().split(/\s+/).filter(Boolean);
    for (const rawTerm of terms) {
      const term = sanitizeFilterValue(rawTerm);
      if (!term) continue;
      const orClause = SEARCHABLE_FIELDS.map(
        (field) => `${field}.ilike.%${term}%`
      ).join(',');
      query = query.or(orClause);
    }
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

  // Exclude accounts that have been visited (neverVisited filter)
  if (visitedAccountIds && visitedAccountIds.length > 0) {
    query = query.not('id', 'in', `(${visitedAccountIds.join(',')})`);
  }

  // Include only accounts visited since a given date (visitedSince filter)
  if (visitedSinceIds !== null) {
    if (visitedSinceIds.length > 0) {
      query = query.in('id', visitedSinceIds);
    } else {
      // No accounts visited since this date — return nothing
      return { accounts: [], total: 0 };
    }
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  query = query.order(sortBy, { ascending: sortOrder === 'asc' }).range(from, to);

  const { data, count, error } = await query;

  if (error) throw error;

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

const accountSchema = z.object({
  type: z.enum(['agency', 'wholesale']),
  display_name: z.string().min(1, 'Display name is required').max(500),
  legal_name: z.string().max(500).optional(),
  agency_id: z.string().max(100).optional(),
  permit_number: z.string().max(100).optional(),
  district: z.string().max(100).optional(),
  address: z.string().max(500).optional(),
  city: z.string().max(200).optional(),
  zip: z.string().max(20).optional(),
  phone: z.string().max(50).optional(),
  delivery_day: z.string().max(20).optional(),
  warehouse: z.string().max(200).optional(),
  linked_agency_name: z.string().max(500).optional(),
  linked_agency_id: z.string().max(100).optional(),
  status: z.enum(['prospect', 'customer']).optional(),
});

/** Capitalize the first letter of each word (proper-name casing). */
function toTitleCase(s: string): string {
  return s.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseAccountFormData(formData: FormData) {
  const type = formData.get('type') as string;
  const raw = {
    type,
    display_name: toTitleCase((formData.get('display_name') as string) || ''),
    legal_name: (formData.get('legal_name') as string) || undefined,
    agency_id: type === 'agency' ? (formData.get('agency_id') as string) || undefined : undefined,
    permit_number: type === 'wholesale' ? (formData.get('permit_number') as string) || undefined : undefined,
    district: (formData.get('district') as string) || undefined,
    address: (formData.get('address') as string) || undefined,
    city: (formData.get('city') as string) || undefined,
    zip: (formData.get('zip') as string) || undefined,
    phone: (formData.get('phone') as string) || undefined,
    delivery_day: type === 'agency' ? (formData.get('delivery_day') as string) || undefined : undefined,
    warehouse: type === 'agency' ? (formData.get('warehouse') as string) || undefined : undefined,
    linked_agency_name: type === 'wholesale' ? (formData.get('linked_agency_name') as string) || undefined : undefined,
    linked_agency_id: type === 'wholesale' ? (formData.get('linked_agency_id') as string) || undefined : undefined,
    status: type === 'wholesale' ? (formData.get('status') as string) || undefined : undefined,
  };

  const parsed = accountSchema.parse(raw);

  return {
    type: parsed.type,
    display_name: parsed.display_name,
    legal_name: parsed.legal_name || null,
    agency_id: parsed.agency_id || null,
    permit_number: parsed.permit_number || null,
    district: parsed.district || null,
    address: parsed.address || null,
    city: parsed.city || null,
    zip: parsed.zip || null,
    phone: parsed.phone || null,
    delivery_day: parsed.delivery_day || null,
    warehouse: parsed.warehouse || null,
    linked_agency_name: parsed.linked_agency_name || null,
    linked_agency_id: parsed.linked_agency_id || null,
    status: parsed.status ?? (parsed.type === 'wholesale' ? 'customer' : undefined),
  };
}

/**
 * Create a new account.
 * @param ownerRepId Optional — if provided, wholesale accounts are claimed under
 *   this user ID instead of the calling user (used by the assignment flow so the
 *   account lands under the assigned rep, not the admin creating the assignment).
 */
export async function createAccount(formData: FormData, ownerRepId?: string) {
  const supabase = await createClient();
  const account = parseAccountFormData(formData);

  // Auto-assign owner for Bar/Restaurant (wholesale) accounts
  let owner_rep_id: string | null = null;
  if (account.type === 'wholesale') {
    if (ownerRepId) {
      owner_rep_id = ownerRepId; // explicit override (e.g. assignment flow)
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) owner_rep_id = user.id;
    }
  }

  const { data, error } = await supabase
    .from('accounts')
    .insert({ ...account, ...(owner_rep_id ? { owner_rep_id } : {}) })
    .select()
    .single();

  if (error) throw error;

  revalidatePath('/accounts');
  return data;
}

export async function updateAccount(id: string, formData: FormData) {
  const supabase = await createClient();

  // Fetch existing account to ensure type isn't changed
  const { data: existing, error: fetchErr } = await supabase
    .from('accounts')
    .select('type')
    .eq('id', id)
    .single();
  if (fetchErr) throw fetchErr;

  const updates = parseAccountFormData(formData);

  // Prevent type change on update
  if (existing && updates.type !== existing.type) {
    throw new Error('Cannot change account type after creation');
  }

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
  const { data, error } = await supabase
    .from('accounts')
    .select('district')
    .not('district', 'is', null)
    .order('district');

  if (error) throw error;
  const unique = [...new Set(data?.map((d) => d.district).filter(Boolean))];
  return unique as string[];
}

export async function getReps() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('role', ['rep', 'admin'])
    .order('full_name');

  if (error) throw error;
  return data ?? [];
}

export async function searchAccounts(query: string) {
  const supabase = await createClient();

  const terms = query.trim().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const sanitized = terms.map(sanitizeFilterValue).filter(Boolean);
  if (sanitized.length === 0) return [];

  let q = supabase
    .from('accounts')
    .select('id, display_name, type, district, city, agency_id');

  for (const term of sanitized) {
    const orClause = SEARCHABLE_FIELDS.map(
      (field) => `${field}.ilike.%${term}%`
    ).join(',');
    q = q.or(orClause);
  }

  const { data, error } = await q.limit(10);
  if (error) throw error;
  return data ?? [];
}

export async function getPendingApprovalAccounts() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('needs_review', true)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}
