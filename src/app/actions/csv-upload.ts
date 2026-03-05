'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import Papa from 'papaparse';

// Expected headers for validation
const ANNUAL_HEADERS = [
  'District', 'Agency_Id', 'Agency_Name', 'Vendor', 'Brand',
  'Name', 'Category', 'Retail_Bottles_Sold', 'Retail_Amount',
  'Retail_Tax', 'Wholesale_Bottles_Sold', 'Wholesale_Amount', 'Wholesale_Tax',
];

const WHOLESALE_HEADERS = [
  'District', 'Agency_Id', 'Agency_Name', 'DimVendor_VendorNumber_', 'Brand',
  'Name', 'Category', 'Permit_Number', 'Wholesaler', 'Doing_Business_As',
  'Wholesale_Bottles_Sold', 'Wholesale_Amount', 'Wholesale_Tax',
];

function cleanNumeric(value: string | undefined | null): number | null {
  if (!value) return null;
  // Strip quotes, commas, whitespace, BOM
  const cleaned = value.replace(/[\u{FEFF}"',\s]/gu, (match) =>
    match === ',' || match === '"' || match === '\uFEFF' || match.trim() === '' ? '' : match
  ).replace(/,/g, '').replace(/"/g, '').trim();
  if (cleaned === '' || cleaned === '-') return null;
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function stripBOM(text: string): string {
  return text.replace(/^\uFEFF/, '');
}

export async function validateCSV(
  csvText: string,
  dataSource: 'annual_summary' | 'wholesale'
) {
  const cleaned = stripBOM(csvText);
  const expectedHeaders =
    dataSource === 'annual_summary' ? ANNUAL_HEADERS : WHOLESALE_HEADERS;

  const result = Papa.parse(cleaned, {
    header: true,
    skipEmptyLines: true,
  });

  if (result.errors.length > 0 && result.data.length === 0) {
    return {
      valid: false,
      error: `CSV parse error: ${result.errors[0].message}`,
      preview: [],
      totalRows: 0,
    };
  }

  // Check headers
  const headers = result.meta.fields || [];
  const missingHeaders = expectedHeaders.filter((h) => !headers.includes(h));

  if (missingHeaders.length > 0) {
    return {
      valid: false,
      error: `Missing columns: ${missingHeaders.join(', ')}`,
      preview: [],
      totalRows: 0,
    };
  }

  return {
    valid: true,
    error: null,
    preview: result.data.slice(0, 10) as Record<string, string>[],
    totalRows: result.data.length,
    headers,
  };
}

export async function processCSVUpload({
  csvText,
  dataSource,
  uploadPeriod,
  fileName,
}: {
  csvText: string;
  dataSource: 'annual_summary' | 'wholesale';
  uploadPeriod: string;
  fileName: string;
}) {
  const supabase = await createClient();

  // Verify admin role
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') {
    throw new Error('Only admins can upload CSV data');
  }

  const cleaned = stripBOM(csvText);
  const result = Papa.parse(cleaned, {
    header: true,
    skipEmptyLines: true,
  });

  if (result.data.length === 0) {
    throw new Error('CSV contains no data rows');
  }

  // Create upload batch
  const { data: batch, error: batchError } = await supabase
    .from('upload_batches')
    .insert({
      uploaded_by: user.id,
      data_source: dataSource,
      upload_period: uploadPeriod,
      file_name: fileName,
      row_count: result.data.length,
      status: 'pending',
    })
    .select()
    .single();

  if (batchError) throw batchError;

  let matchedCount = 0;
  let unmatchedCount = 0;

  // Process rows in chunks
  const rows = result.data as Record<string, string>[];
  const chunkSize = 500;

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const salesRows = [];

    for (const row of chunk) {
      if (dataSource === 'annual_summary') {
        // Match agency by agency_id
        const agencyId = row['Agency_Id']?.trim();
        let matchedAccountId: string | null = null;
        let matchStatus: 'matched' | 'unmatched' = 'unmatched';

        if (agencyId) {
          const { data: account } = await supabase
            .from('accounts')
            .select('id')
            .eq('agency_id', agencyId)
            .eq('type', 'agency')
            .single();

          if (account) {
            matchedAccountId = account.id;
            matchStatus = 'matched';
            matchedCount++;
          } else {
            unmatchedCount++;
          }
        }

        salesRows.push({
          upload_batch_id: batch.id,
          data_source: 'annual_summary' as const,
          district: row['District']?.trim() || null,
          agency_id: agencyId || null,
          agency_name: row['Agency_Name']?.trim() || null,
          vendor: row['Vendor']?.trim() || null,
          brand: row['Brand']?.trim() || null,
          product_name: row['Name']?.trim() || null,
          category: row['Category']?.trim() || null,
          retail_bottles_sold: cleanNumeric(row['Retail_Bottles_Sold']),
          retail_amount: cleanNumeric(row['Retail_Amount']),
          retail_tax: cleanNumeric(row['Retail_Tax']),
          wholesale_bottles_sold: cleanNumeric(row['Wholesale_Bottles_Sold']),
          wholesale_amount: cleanNumeric(row['Wholesale_Amount']),
          wholesale_tax: cleanNumeric(row['Wholesale_Tax']),
          upload_period: uploadPeriod,
          matched_account_id: matchedAccountId,
          match_status: matchStatus,
        });
      } else {
        // Wholesale data
        const permitNumber = row['Permit_Number']?.trim();
        const wholesaler = row['Wholesaler']?.trim() || null;
        const dba = row['Doing_Business_As']?.trim() || null;
        let matchedAccountId: string | null = null;
        let matchStatus: 'matched' | 'unmatched' | 'pending_approval' = 'unmatched';

        if (permitNumber) {
          const { data: account } = await supabase
            .from('accounts')
            .select('id')
            .eq('permit_number', permitNumber)
            .eq('type', 'wholesale')
            .single();

          if (account) {
            matchedAccountId = account.id;
            matchStatus = 'matched';
            matchedCount++;
          } else {
            // Auto-create wholesale account with needs_review = true
            // Display name: DBA if present, else Wholesaler name
            const displayName = dba || wholesaler || `Unknown (${permitNumber})`;
            const district = row['District']?.trim() || null;

            const { data: newAccount, error: createError } = await supabase
              .from('accounts')
              .insert({
                type: 'wholesale' as const,
                permit_number: permitNumber,
                display_name: displayName,
                legal_name: wholesaler,
                district,
                needs_review: true,
              })
              .select()
              .single();

            if (createError) {
              // Might be duplicate permit_number from earlier in this batch
              // Try to find the just-created account
              const { data: existingAccount } = await supabase
                .from('accounts')
                .select('id')
                .eq('permit_number', permitNumber)
                .eq('type', 'wholesale')
                .single();

              if (existingAccount) {
                matchedAccountId = existingAccount.id;
                matchStatus = 'matched';
                matchedCount++;
              } else {
                unmatchedCount++;
              }
            } else {
              matchedAccountId = newAccount.id;
              matchStatus = 'pending_approval';
              matchedCount++;
            }
          }
        } else {
          unmatchedCount++;
        }

        salesRows.push({
          upload_batch_id: batch.id,
          data_source: 'wholesale' as const,
          district: row['District']?.trim() || null,
          agency_id: row['Agency_Id']?.trim() || null,
          agency_name: row['Agency_Name']?.trim() || null,
          permit_number: permitNumber || null,
          wholesaler,
          doing_business_as: dba,
          vendor: row['DimVendor_VendorNumber_']?.trim() || null,
          brand: row['Brand']?.trim() || null,
          product_name: row['Name']?.trim() || null,
          category: row['Category']?.trim() || null,
          wholesale_bottles_sold: cleanNumeric(row['Wholesale_Bottles_Sold']),
          wholesale_amount: cleanNumeric(row['Wholesale_Amount']),
          wholesale_tax: cleanNumeric(row['Wholesale_Tax']),
          upload_period: uploadPeriod,
          matched_account_id: matchedAccountId,
          match_status: matchStatus,
        });
      }
    }

    // Bulk insert sales data chunk
    const { error: insertError } = await supabase
      .from('sales_data')
      .insert(salesRows);

    if (insertError) throw insertError;
  }

  // Update batch with counts
  const { error: updateError } = await supabase
    .from('upload_batches')
    .update({
      matched_count: matchedCount,
      unmatched_count: unmatchedCount,
      status: 'processed',
    })
    .eq('id', batch.id);

  if (updateError) throw updateError;

  revalidatePath('/admin');
  revalidatePath('/admin/upload');
  revalidatePath('/accounts');

  return {
    batchId: batch.id,
    totalRows: rows.length,
    matchedCount,
    unmatchedCount,
  };
}

export async function getUploadBatches() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('upload_batches')
    .select('*, uploader:profiles!upload_batches_uploaded_by_fkey(full_name, email)')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function deleteUploadBatch(batchId: string) {
  const supabase = await createClient();

  // Delete sales data rows first (cascade should handle it, but be explicit)
  await supabase.from('sales_data').delete().eq('upload_batch_id', batchId);

  // Delete the batch
  const { error } = await supabase
    .from('upload_batches')
    .delete()
    .eq('id', batchId);

  if (error) throw error;

  revalidatePath('/admin');
  revalidatePath('/admin/upload');
}

export async function getUnmatchedRecords() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('sales_data')
    .select('*')
    .eq('match_status', 'unmatched')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;
  return data ?? [];
}

export async function linkSalesDataToAccount(
  salesDataId: string,
  accountId: string
) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('sales_data')
    .update({
      matched_account_id: accountId,
      match_status: 'matched',
    })
    .eq('id', salesDataId);

  if (error) throw error;

  revalidatePath('/admin/unmatched');
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
