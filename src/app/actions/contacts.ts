'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

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

  let query = supabase
    .from('contacts')
    .select('*, account:accounts!contacts_account_id_fkey(id, display_name, type)', {
      count: 'exact',
    });

  if (search) {
    query = query.or(`name.ilike.%${search}%`);
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

export async function createContact(formData: {
  name: string;
  account_id: string;
  phone?: string;
  email?: string;
  title_role?: string;
}) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('contacts')
    .insert({
      name: formData.name,
      account_id: formData.account_id,
      phone: formData.phone || null,
      email: formData.email || null,
      title_role: formData.title_role || null,
    })
    .select()
    .single();

  if (error) throw error;

  revalidatePath('/contacts');
  revalidatePath(`/accounts/${formData.account_id}`);
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
  const supabase = await createClient();

  const { error } = await supabase
    .from('contacts')
    .update({
      name: formData.name,
      phone: formData.phone || null,
      email: formData.email || null,
      title_role: formData.title_role || null,
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
