'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import Papa from 'papaparse';

const EXPECTED_HEADERS = [
  'AgencyID', 'DBA', 'Address', 'City', 'Zip', 'Agency Phone',
  'Warehouse', 'Delivery Day',
];

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

export async function validateAgencyCSV(csvText: string) {
  const cleaned = csvText.replace(/^\uFEFF/, '');
  const parsed = Papa.parse<AgencyRow>(cleaned, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    return { valid: false, error: `CSV parse error: ${parsed.errors[0].message}` };
  }

  const headers = parsed.meta.fields ?? [];
  const missing = EXPECTED_HEADERS.filter((h) => !headers.includes(h));

  if (missing.length > 0) {
    return { valid: false, error: `Missing headers: ${missing.join(', ')}` };
  }

  const preview = parsed.data.slice(0, 10).map((row) => ({
    agencyId: row.AgencyID,
    dba: row.DBA,
    city: row.City,
    deliveryDay: row['Delivery Day'],
    warehouse: row.Warehouse,
    primaryContact: row['Primary Contact'],
  }));

  return {
    valid: true,
    preview,
    totalRows: parsed.data.length,
  };
}

export async function processAgencyImport(csvText: string, createContacts: boolean) {
  const supabase = await createClient();
  const cleaned = csvText.replace(/^\uFEFF/, '');
  const parsed = Papa.parse<AgencyRow>(cleaned, {
    header: true,
    skipEmptyLines: true,
  });

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let contactsCreated = 0;

  for (const row of parsed.data) {
    const agencyId = row.AgencyID?.trim();
    if (!agencyId) {
      skipped++;
      continue;
    }

    // Check if account exists
    const { data: existing } = await supabase
      .from('accounts')
      .select('id')
      .eq('agency_id', agencyId)
      .eq('type', 'agency')
      .maybeSingle();

    const accountData = {
      type: 'agency' as const,
      agency_id: agencyId,
      display_name: row.DBA?.trim() || `Agency ${agencyId}`,
      delivery_day: row['Delivery Day']?.trim() || null,
      address: row.Address?.trim() || null,
      city: row.City?.trim() || null,
      zip: row.Zip?.trim() || null,
      warehouse: row.Warehouse?.trim() || null,
      phone: row['Agency Phone']?.trim() || null,
    };

    let accountId: string;

    if (existing) {
      // Update existing
      const { error } = await supabase
        .from('accounts')
        .update(accountData)
        .eq('id', existing.id);

      if (error) {
        skipped++;
        continue;
      }
      accountId = existing.id;
      updated++;
    } else {
      // Create new
      const { data: newAccount, error } = await supabase
        .from('accounts')
        .insert(accountData)
        .select('id')
        .single();

      if (error || !newAccount) {
        skipped++;
        continue;
      }
      accountId = newAccount.id;
      created++;
    }

    // Create contact if requested
    if (createContacts && row['Primary Contact']?.trim()) {
      // Check if contact already exists for this account with this name
      const contactName = row['Primary Contact'].trim();
      const { data: existingContact } = await supabase
        .from('contacts')
        .select('id')
        .eq('account_id', accountId)
        .eq('name', contactName)
        .maybeSingle();

      if (!existingContact) {
        const { error: contactError } = await supabase
          .from('contacts')
          .insert({
            name: contactName,
            account_id: accountId,
            phone: row['Primary Contact Phone']?.trim() || null,
          });

        if (!contactError) {
          contactsCreated++;
        }
      }
    }
  }

  revalidatePath('/accounts');
  revalidatePath('/contacts');

  return { created, updated, skipped, contactsCreated, total: parsed.data.length };
}
