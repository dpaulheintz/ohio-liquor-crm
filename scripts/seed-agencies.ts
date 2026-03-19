import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import Papa from 'papaparse';
import { readFileSync } from 'fs';
import { resolve } from 'path';

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

function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment'
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function main() {
  const csvPath = resolve(__dirname, 'data', 'partner-agencies.csv');
  const csvText = readFileSync(csvPath, 'utf-8').replace(/^\uFEFF/, '');

  const { data: rows, errors } = Papa.parse<AgencyRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (errors.length > 0) {
    console.error('CSV parse errors:', errors);
    process.exit(1);
  }

  console.log(`Parsed ${rows.length} rows from CSV`);

  const supabase = createAdminClient();

  // Fetch all existing agency accounts in one query
  const { data: existingAccounts, error: fetchErr } = await supabase
    .from('accounts')
    .select('id, agency_id')
    .eq('type', 'agency');

  if (fetchErr) {
    console.error('Failed to fetch existing accounts:', fetchErr.message);
    process.exit(1);
  }

  const existingMap = new Map(
    (existingAccounts ?? []).map((a) => [a.agency_id, a.id])
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;

  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: { id: string; data: Record<string, unknown> }[] = [];

  for (const row of rows) {
    const agencyId = row.AgencyID?.trim();
    if (!agencyId) {
      skipped++;
      continue;
    }

    const accountData = {
      type: 'agency' as const,
      agency_id: agencyId,
      display_name: row.DBA?.trim() || `Agency ${agencyId}`,
      address: row.Address?.trim() || null,
      city: row.City?.trim() || null,
      state: 'OH',
      zip: row.Zip?.trim() || null,
      phone: row['Agency Phone']?.trim() || null,
      warehouse: row.Warehouse?.trim() || null,
      delivery_day: row['Delivery Day']?.trim() || null,
    };

    const existingId = existingMap.get(agencyId);
    if (existingId) {
      toUpdate.push({ id: existingId, data: accountData });
    } else {
      toInsert.push(accountData);
    }
  }

  // Batch insert new accounts
  if (toInsert.length > 0) {
    const { data: inserted, error: insertErr } = await supabase
      .from('accounts')
      .insert(toInsert)
      .select('id, agency_id');

    if (insertErr) {
      console.error('Batch insert failed:', insertErr.message);
      process.exit(1);
    }
    created = inserted?.length ?? 0;

    for (const acc of inserted ?? []) {
      existingMap.set(acc.agency_id, acc.id);
    }
  }

  // Update existing accounts one-by-one (Supabase doesn't support bulk update by different IDs)
  for (const item of toUpdate) {
    const { error: updateErr } = await supabase
      .from('accounts')
      .update(item.data)
      .eq('id', item.id);

    if (updateErr) {
      console.error(`Update failed for ${item.data.agency_id}:`, updateErr.message);
      skipped++;
      continue;
    }
    updated++;
  }

  console.log(`Accounts — created: ${created}, updated: ${updated}, skipped: ${skipped}`);

  // --- Contacts ---

  // Build a map of agency_id -> contact info from CSV
  const contactRows = rows.filter((r) => r['Primary Contact']?.trim());

  // Gather all account IDs we'll need contacts for
  const accountIds = contactRows
    .map((r) => existingMap.get(r.AgencyID?.trim()))
    .filter(Boolean) as string[];

  // Fetch existing contacts in batches to avoid URL length limits
  const BATCH_SIZE = 50;
  const allExistingContacts: { account_id: string; name: string }[] = [];

  for (let i = 0; i < accountIds.length; i += BATCH_SIZE) {
    const batch = accountIds.slice(i, i + BATCH_SIZE);
    const { data, error: contactFetchErr } = await supabase
      .from('contacts')
      .select('account_id, name')
      .in('account_id', batch);

    if (contactFetchErr) {
      console.error('Failed to fetch existing contacts:', contactFetchErr.message);
      process.exit(1);
    }
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
      name: contactName,
      phone: row['Primary Contact Phone']?.trim() || null,
    });

    existingContactSet.add(key);
  }

  let contactsCreated = 0;

  if (contactsToInsert.length > 0) {
    const { data: insertedContacts, error: contactInsertErr } = await supabase
      .from('contacts')
      .insert(contactsToInsert)
      .select('id');

    if (contactInsertErr) {
      console.error('Contact batch insert failed:', contactInsertErr.message);
    } else {
      contactsCreated = insertedContacts?.length ?? 0;
    }
  }

  console.log(`Contacts — created: ${contactsCreated}`);
  console.log(
    `\nDone! Total CSV rows: ${rows.length}, accounts created: ${created}, updated: ${updated}, skipped: ${skipped}, contacts created: ${contactsCreated}`
  );
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
