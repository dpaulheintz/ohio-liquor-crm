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

  let query = supabase
    .from('contacts')
    .select('*, account:accounts!contacts_account_id_fkey(id, display_name, type)', {
      count: 'exact',
    });

  if (search) {
    const sanitized = search.replace(/[,()]/g, '');
    query = query.or(
      `name.ilike.%${sanitized}%,phone.ilike.%${sanitized}%,email.ilike.%${sanitized}%,title_role.ilike.%${sanitized}%`
    );
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

export async function createContact(formData: {
  name: string;
  account_id: string;
  phone?: string;
  email?: string;
  title_role?: string;
}) {
  const parsed = contactSchema.parse(formData);
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
  const parsed = contactUpdateSchema.parse(formData);
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
