'use server';

import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import Papa from 'papaparse';

interface AgencyRow {
  AgencyID: string;
  DBA: string;
  Address: string;
  City: string;
  County: string;
  Zip: string;
  'Agency Phone': string;
  Wholesale: string;
  Warehouse: string;
  'Order Day': string;
  Week: string;
  'Delivery Day': string;
  'Primary Contact': string;
  'Primary Contact Phone': string;
}

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  }
  return createAdminClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function seedAgenciesForOrg(orgId: string): Promise<{
  accountsCreated: number;
  accountsUpdated: number;
  contactsCreated: number;
  skipped: number;
}> {
  // Auth check — only super_admins may run this
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: isSuperAdmin } = await supabase.rpc('is_super_admin');
  if (!isSuperAdmin) throw new Error('Only super admins can seed agencies');

  // Validate org exists
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('id', orgId)
    .single();
  if (orgErr || !org) throw new Error('Organization not found');

  // Read CSV
  const csvPath = join(process.cwd(), 'data', 'seed-agencies.csv');
  const csvText = readFileSync(csvPath, 'utf-8').replace(/^﻿/, '');

  const { data: rows, errors } = Papa.parse<AgencyRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (errors.length > 0) {
    throw new Error(`CSV parse errors: ${errors.map((e) => e.message).join(', ')}`);
  }

  // Use service role client to bypass RLS for bulk operations
  const admin = getServiceClient();

  // Fetch existing agency accounts for this org
  const { data: existingAccounts, error: fetchErr } = await admin
    .from('accounts')
    .select('id, agency_id')
    .eq('type', 'agency')
    .eq('organization_id', orgId);

  if (fetchErr) throw new Error(`Failed to fetch existing accounts: ${fetchErr.message}`);

  const existingMap = new Map(
    (existingAccounts ?? []).map((a) => [a.agency_id, a.id])
  );

  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: { id: string; data: Record<string, unknown> }[] = [];
  let skipped = 0;

  for (const row of rows) {
    const agencyId = row.AgencyID?.trim();
    if (!agencyId) {
      skipped++;
      continue;
    }

    const accountData = {
      type: 'agency' as const,
      agency_id: agencyId,
      organization_id: orgId,
      display_name: row.DBA?.trim() || `Agency ${agencyId}`,
      address: row.Address?.trim() || null,
      city: row.City?.trim() || null,
      state: 'OH',
      zip: row.Zip?.trim() || null,
      phone: row['Agency Phone']?.trim() || null,
      warehouse: row.Warehouse?.trim() || null,
      delivery_day: row['Delivery Day']?.trim() || null,
      status: 'customer' as const,
    };

    const existingId = existingMap.get(agencyId);
    if (existingId) {
      toUpdate.push({ id: existingId, data: accountData });
    } else {
      toInsert.push(accountData);
    }
  }

  // Batch insert new accounts
  let accountsCreated = 0;
  if (toInsert.length > 0) {
    const { data: inserted, error: insertErr } = await admin
      .from('accounts')
      .insert(toInsert)
      .select('id, agency_id');

    if (insertErr) throw new Error(`Batch insert failed: ${insertErr.message}`);
    accountsCreated = inserted?.length ?? 0;

    for (const acc of inserted ?? []) {
      existingMap.set(acc.agency_id, acc.id);
    }
  }

  // Update existing accounts
  let accountsUpdated = 0;
  for (const item of toUpdate) {
    const { error: updateErr } = await admin
      .from('accounts')
      .update(item.data)
      .eq('id', item.id);

    if (updateErr) {
      console.error(`Update failed for agency ${item.data.agency_id}:`, updateErr.message);
      skipped++;
      continue;
    }
    accountsUpdated++;
  }

  // --- Contacts ---
  const contactRows = rows.filter((r) => r['Primary Contact']?.trim());
  const accountIds = contactRows
    .map((r) => existingMap.get(r.AgencyID?.trim()))
    .filter(Boolean) as string[];

  // Fetch existing contacts in batches
  const BATCH_SIZE = 50;
  const allExistingContacts: { account_id: string; name: string }[] = [];
  for (let i = 0; i < accountIds.length; i += BATCH_SIZE) {
    const batch = accountIds.slice(i, i + BATCH_SIZE);
    const { data, error: cfErr } = await admin
      .from('contacts')
      .select('account_id, name')
      .in('account_id', batch);
    if (cfErr) throw new Error(`Failed to fetch contacts: ${cfErr.message}`);
    allExistingContacts.push(...(data ?? []));
  }

  const existingContactSet = new Set(
    allExistingContacts.map((c) => `${c.account_id}::${c.name}`)
  );

  const contactsToInsert: Record<string, unknown>[] = [];
  for (const row of contactRows) {
    const agencyId = row.AgencyID?.trim();
    const accountId = existingMap.get(agencyId!);
    if (!accountId) continue;

    const contactName = row['Primary Contact'].trim();
    const key = `${accountId}::${contactName}`;
    if (existingContactSet.has(key)) continue;

    contactsToInsert.push({
      account_id: accountId,
      organization_id: orgId,
      name: contactName,
      phone: row['Primary Contact Phone']?.trim() || null,
    });
    existingContactSet.add(key);
  }

  let contactsCreated = 0;
  if (contactsToInsert.length > 0) {
    const { data: insertedContacts, error: cInsertErr } = await admin
      .from('contacts')
      .insert(contactsToInsert)
      .select('id');

    if (cInsertErr) {
      console.error('Contact batch insert failed:', cInsertErr.message);
    } else {
      contactsCreated = insertedContacts?.length ?? 0;
    }
  }

  return { accountsCreated, accountsUpdated, contactsCreated, skipped };
}
