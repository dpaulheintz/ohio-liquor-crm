'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

export async function getContacts({
  search,
  page = 1,
  pageSize = 20,
}: {
  search?: string;
  page?: number;
  pageSize?: number;
} = {}) {
  const supabase = await createClient();

  // Supabase PostgREST doesn't support .or() across joined tables,
  // so when the search includes terms that don't match contact fields
  // we need to find matching account IDs first and include them.
  let accountIds: string[] | null = null;

  if (search) {
    const sanitized = search.replace(/[,()]/g, '');
    const terms = sanitized.trim().split(/\s+/).filter(Boolean);

    if (terms.length > 0) {
      // Search accounts by all searchable fields (name, city, agency_id, etc.)
      let accountQuery = supabase
        .from('accounts')
        .select('id');

      for (const term of terms) {
        const orClause = [
          'display_name', 'city', 'agency_id', 'address', 'district', 'legal_name',
        ].map((f) => `${f}.ilike.%${term}%`).join(',');
        accountQuery = accountQuery.or(orClause);
      }

      const { data: matchedAccounts } = await accountQuery;
      accountIds = matchedAccounts?.map((a) => a.id) ?? [];
    }
  }

  let query = supabase
    .from('contacts')
    .select('*, account:accounts!contacts_account_id_fkey(id, display_name, type, city)', {
      count: 'exact',
    });

  if (search) {
    const sanitized = search.replace(/[,()]/g, '');

    // Build OR: match contact fields OR belong to a matching account
    let orParts = `name.ilike.%${sanitized}%,phone.ilike.%${sanitized}%,email.ilike.%${sanitized}%,title_role.ilike.%${sanitized}%`;

    if (accountIds && accountIds.length > 0) {
      orParts += `,account_id.in.(${accountIds.join(',')})`;
    }

    query = query.or(orParts);
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  query = query.order('name').range(from, to);

  const { data, count, error } = await query;
  if (error) throw error;

  return { contacts: data ?? [], total: count ?? 0 };
}

export async function getContact(id: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('contacts')
    .select('*, account:accounts!contacts_account_id_fkey(id, display_name, type)')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function getContactsByAccount(accountId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('account_id', accountId)
    .order('name');

  if (error) throw error;
  return data ?? [];
}

const contactSchema = z.object({
  name: z.string().min(1, 'Name is required').max(300),
  account_id: z.string().uuid('Invalid account ID'),
  phone: z.string().max(50).optional(),
  email: z.string().email('Invalid email').max(300).optional().or(z.literal('')),
  title_role: z.string().max(200).optional(),
});

const contactUpdateSchema = contactSchema.omit('account_id');

/** Capitalize the first letter of each word (proper-name casing). */
function toTitleCase(s: string): string {
  return s.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function createContact(formData: {
  name: string;
  account_id: string;
  phone?: string;
  email?: string;
  title_role?: string;
}) {
  const parsed = contactSchema.parse({ ...formData, name: toTitleCase(formData.name) });
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('contacts')
    .insert({
      name: parsed.name,
      account_id: parsed.account_id,
      phone: parsed.phone || null,
      email: parsed.email || null,
      title_role: parsed.title_role || null,
    })
    .select()
    .single();

  if (error) throw error;

  revalidatePath('/contacts');
  revalidatePath(`/accounts/${parsed.account_id}`);
  return data;
}

export async function updateContact(
  id: string,
  formData: {
    name: string;
    phone?: string;
    email?: string;
    title_role?: string;
  }
) {
  const parsed = contactUpdateSchema.parse({ ...formData, name: toTitleCase(formData.name) });
  const supabase = await createClient();

  const { error } = await supabase
    .from('contacts')
    .update({
      name: parsed.name,
      phone: parsed.phone || null,
      email: parsed.email || null,
      title_role: parsed.title_role || null,
    })
    .eq('id', id);

  if (error) throw error;

  revalidatePath('/contacts');
}

export async function deleteContact(id: string) {
  const supabase = await createClient();

  const { error } = await supabase.from('contacts').delete().eq('id', id);
  if (error) throw error;

  revalidatePath('/contacts');
}
