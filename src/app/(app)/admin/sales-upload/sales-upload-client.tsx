'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Papa from 'papaparse';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Upload, FileText, CheckCircle, AlertTriangle, Clock, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveBrand, resolveAgency, parseAmount, parseBottles } from '@/lib/brand-taxonomy';
import { upsertSalesRows, upsertWholesaleRows } from '@/app/actions/sales';
import { upsertBailment } from '@/app/actions/bailment';
import type { SalesRowInput, WholesaleRowInput, SalesHealth } from '@/app/actions/sales';
import type { BailmentEntry } from '@/app/actions/bailment';

// ─── CSV column maps ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseSalesCSV(rows: any[], month: string): SalesRowInput[] {
  return rows.map((r) => {
    const brandCode = String(r['Brand'] ?? '').trim();
    const rawName = String(r['Name'] ?? '').trim();
    const brand = resolveBrand(brandCode, rawName);
    const agency = resolveAgency(String(r['Agency_Id'] ?? '').trim());
    return {
      month,
      agency_id: String(r['Agency_Id'] ?? '').trim(),
      agency_name: r['Agency_Name'] ?? null,
      district: r['District'] ?? null,
      vendor: r['Vendor'] ?? null,
      ...brand,
      category: r['Category'] ?? null,
      ...agency,
      retail_bottles: parseBottles(r['Retail_Bottles_Sold']),
      retail_amount: parseAmount(r['Retail_Amount']),
      wholesale_bottles: parseBottles(r['Wholesale_Bottles_Sold']),
      wholesale_amount: parseAmount(r['Wholesale_Amount']),
    };
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseWholesaleCSV(rows: any[], month: string): WholesaleRowInput[] {
  return rows.map((r) => {
    const brandCode = String(r['Brand'] ?? '').trim();
    const rawName = String(r['Name'] ?? '').trim();
    const brand = resolveBrand(brandCode, rawName);
    const agency = resolveAgency(String(r['Agency_Id'] ?? '').trim());
    return {
      month,
      agency_id: String(r['Agency_Id'] ?? '').trim(),
      agency_name: r['Agency_Name'] ?? null,
      district: r['District'] ?? null,
      vendor: r['DimVendor_VendorNumber_'] ?? null,
      ...brand,
      category: r['Category'] ?? null,
      ...agency,
      permit_number: String(r['Permit_Number'] ?? '').trim(),
      wholesaler_name: r['Wholesaler'] ?? null,
      dba: r['Doing_Business_As'] ?? null,
      bottles_sold: parseBottles(r['Wholesale_Bottles_Sold']),
      amount: parseAmount(r['Wholesale_Amount']),
    };
  });
}

function extractMonth(filename: string): string | null {
  const m = filename.match(/(\d{4}-\d{2})/);
  return m ? m[1] : null;
}

// ─── File drop zone ───────────────────────────────────────────────────────────

interface FileZoneProps {
  label: string;
  accept?: string;
  file: File | null;
  onFile: (f: File) => void;
  onClear: () => void;
  rowCount?: number;
  month?: string;
  unrecognized?: number;
}

function FileZone({ label, file, onFile, onClear, rowCount, month, unrecognized }: FileZoneProps) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div
      className={cn(
        'relative rounded-lg border-2 border-dashed p-4 transition-colors cursor-pointer',
        file ? 'border-primary/40 bg-primary/5' : 'border-muted-foreground/20 hover:border-muted-foreground/40'
      )}
      onClick={() => !file && ref.current?.click()}
    >
      <input
        ref={ref}
        type="file"
        accept=".csv"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
      {file ? (
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2">
            <FileText className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">{file.name}</p>
              {month && <p className="text-xs text-muted-foreground">Month: {month}</p>}
              {rowCount !== undefined && (
                <p className="text-xs text-muted-foreground">{rowCount} rows parsed</p>
              )}
              {unrecognized !== undefined && unrecognized > 0 && (
                <p className="text-xs text-amber-600">{unrecognized} unrecognized brand codes</p>
              )}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={(e) => { e.stopPropagation(); onClear(); }}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 py-2 text-center">
          <Upload className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">Click to browse</p>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtDollar(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);
}

function fmtMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

// ─── Bailment entry form ──────────────────────────────────────────────────────

interface BailmentFormProps {
  initialEntries: BailmentEntry[];
}

function BailmentForm({ initialEntries }: BailmentFormProps) {
  const router = useRouter();
  const [month, setMonth] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [entries, setEntries] = useState<BailmentEntry[]>(initialEntries);

  async function handleSave() {
    if (!month || !amount) return;
    const parsed = parseFloat(amount.replace(/[^0-9.]/g, ''));
    if (isNaN(parsed)) { toast.error('Invalid amount'); return; }
    setSaving(true);
    setConfirmation(null);
    try {
      await upsertBailment(month, parsed);
      const label = fmtMonthLabel(month);
      setConfirmation(`Bailment for ${label} saved: ${fmtDollar(parsed)}`);
      toast.success(`Bailment for ${label} saved`);
      // Optimistically update the list
      setEntries(prev => {
        const next = prev.filter(e => e.month !== month);
        return [{ id: month, month, amount: parsed }, ...next].sort((a, b) => b.month.localeCompare(a.month));
      });
      setAmount('');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Update Monthly Bailment</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Input row */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Month</label>
            <input
              type="month"
              value={month}
              onChange={(e) => { setMonth(e.target.value); setConfirmation(null); }}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Amount ($)</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="e.g. 215000.50"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setConfirmation(null); }}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm w-44 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <Button onClick={handleSave} disabled={saving || !month || !amount} className="shrink-0">
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>

        {/* Confirmation */}
        {confirmation && (
          <div className="flex items-center gap-2 text-sm text-emerald-600">
            <CheckCircle className="h-4 w-4" />
            {confirmation}
          </div>
        )}

        {/* Existing data table */}
        {entries.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Bailment History ({entries.length} months)
            </p>
            <div className="rounded-md border divide-y text-sm max-h-64 overflow-y-auto">
              {entries.map((e) => (
                <div key={e.month} className="flex items-center justify-between px-3 py-2">
                  <span className="font-mono text-sm">{e.month}</span>
                  <span className="text-muted-foreground">{fmtMonthLabel(e.month)}</span>
                  <span className="font-mono font-medium tabular-nums">{fmtDollar(e.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  health: SalesHealth;
  bailmentEntries: BailmentEntry[];
}

interface ParsedData {
  month: string;
  salesRows: SalesRowInput[];
  wholesaleRows: WholesaleRowInput[];
  salesUnrecognized: number;
  wholesaleUnrecognized: number;
}

export function SalesUploadClient({ health, bailmentEntries }: Props) {
  const router = useRouter();
  const [salesFile, setSalesFile] = useState<File | null>(null);
  const [wholesaleFile, setWholesaleFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedData | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ salesCount: number; wholesaleCount: number } | null>(null);

  function parseFile(
    file: File,
    type: 'sales' | 'wholesale',
    otherFile: File | null
  ) {
    const month = extractMonth(file.name);
    if (!month) {
      toast.error(`Cannot extract month from filename: "${file.name}". Expected format: YYYY-MM_...`);
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.replace(/^﻿/, '').trim(), // strip BOM
      complete: (result) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = result.data as any[];

        if (type === 'sales') {
          const salesRows = parseSalesCSV(data, month);
          const salesUnrecognized = salesRows.filter((r) => r.brand_family === 'Unknown').length;

          const otherMonth = otherFile ? extractMonth(otherFile.name) : null;
          if (otherFile && otherMonth && otherMonth !== month) {
            toast.warning(`Month mismatch: Sales is ${month}, Wholesale is ${otherMonth}`);
          }

          setParsed((prev) => ({
            month,
            salesRows,
            wholesaleRows: prev?.wholesaleRows ?? [],
            salesUnrecognized,
            wholesaleUnrecognized: prev?.wholesaleUnrecognized ?? 0,
          }));
        } else {
          const wholesaleRows = parseWholesaleCSV(data, month);
          const wholesaleUnrecognized = wholesaleRows.filter((r) => r.brand_family === 'Unknown').length;

          setParsed((prev) => ({
            month,
            salesRows: prev?.salesRows ?? [],
            wholesaleRows,
            salesUnrecognized: prev?.salesUnrecognized ?? 0,
            wholesaleUnrecognized,
          }));
        }
      },
      error: (err) => {
        toast.error(`Parse error: ${err.message}`);
      },
    });
  }

  async function handleUpload() {
    if (!parsed) return;
    setUploading(true);
    setUploadResult(null);
    try {
      const [s, w] = await Promise.all([
        upsertSalesRows(parsed.salesRows),
        upsertWholesaleRows(parsed.wholesaleRows),
      ]);
      setUploadResult({ salesCount: s.count, wholesaleCount: w.count });
      toast.success(`Uploaded ${s.count} sales rows and ${w.count} wholesale rows for ${parsed.month}`);
      // Reset file state
      setSalesFile(null);
      setWholesaleFile(null);
      setParsed(null);
      router.refresh(); // re-run server component to update health data
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  const salesUnrecognized = parsed?.salesUnrecognized ?? 0;
  const wholesaleUnrecognized = parsed?.wholesaleUnrecognized ?? 0;
  const totalUnrecognized = salesUnrecognized + wholesaleUnrecognized;

  return (
    <div className="space-y-6">
      {/* ── Upload Card ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Upload Monthly CSVs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FileZone
              label="Sales CSV"
              file={salesFile}
              onFile={(f) => {
                setSalesFile(f);
                setUploadResult(null);
                parseFile(f, 'sales', wholesaleFile);
              }}
              onClear={() => {
                setSalesFile(null);
                setParsed((prev) =>
                  prev ? { ...prev, salesRows: [], salesUnrecognized: 0 } : null
                );
              }}
              rowCount={parsed?.salesRows.length}
              month={parsed?.month}
              unrecognized={salesUnrecognized}
            />
            <FileZone
              label="Wholesale CSV"
              file={wholesaleFile}
              onFile={(f) => {
                setWholesaleFile(f);
                setUploadResult(null);
                parseFile(f, 'wholesale', salesFile);
              }}
              onClear={() => {
                setWholesaleFile(null);
                setParsed((prev) =>
                  prev ? { ...prev, wholesaleRows: [], wholesaleUnrecognized: 0 } : null
                );
              }}
              rowCount={parsed?.wholesaleRows.length}
              month={parsed?.month}
              unrecognized={wholesaleUnrecognized}
            />
          </div>

          {/* Preview summary */}
          {parsed && (parsed.salesRows.length > 0 || parsed.wholesaleRows.length > 0) && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <p className="text-sm font-medium">Preview — {parsed.month}</p>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span>{parsed.salesRows.length} sales rows</span>
                <span>{parsed.wholesaleRows.length} wholesale rows</span>
                {totalUnrecognized > 0 && (
                  <span className="flex items-center gap-1 text-amber-600">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {totalUnrecognized} unrecognized brand codes (will ingest as &quot;Unknown&quot;)
                  </span>
                )}
              </div>
              <Button onClick={handleUpload} disabled={uploading} className="mt-2">
                {uploading ? 'Uploading…' : `Upsert ${parsed.month} data`}
              </Button>
            </div>
          )}

          {/* Success result */}
          {uploadResult && (
            <div className="flex items-center gap-2 text-sm text-emerald-600">
              <CheckCircle className="h-4 w-4" />
              Uploaded {uploadResult.salesCount} sales + {uploadResult.wholesaleCount} wholesale rows
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Bailment Entry Card ── */}
      <BailmentForm initialEntries={bailmentEntries} />

      {/* ── Data Health Card ── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Data Health</CardTitle>
            {health.lastMonth && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                Last updated: <strong>{health.lastMonth}</strong>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {health.months.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data loaded yet.</p>
          ) : (
            <>
              {/* Month timeline */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Months Loaded ({health.months.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {health.months.map((m) => (
                    <span
                      key={m}
                      className="inline-flex items-center rounded-md border bg-muted px-2 py-0.5 text-xs font-mono"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>

              {/* Gaps */}
              {health.gaps.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-amber-600 mb-2 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Gaps Detected ({health.gaps.length})
                  </p>
                  <div className="space-y-1">
                    {health.gaps.map((g) => (
                      <p key={g} className="text-sm text-amber-700 dark:text-amber-400 font-mono">
                        {g}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Unrecognized brand codes */}
              {Object.keys(health.unknownCodes).length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Unrecognized Brand Codes
                  </p>
                  <div className="rounded-md border divide-y text-sm">
                    {Object.entries(health.unknownCodes).map(([code, info]) => (
                      <div key={code} className="flex items-center justify-between px-3 py-2">
                        <div>
                          <span className="font-mono font-medium">{code}</span>
                          <span className="ml-2 text-muted-foreground">{info.product_name}</span>
                        </div>
                        <span className="text-muted-foreground">{info.count} rows</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {health.gaps.length === 0 && Object.keys(health.unknownCodes).length === 0 && (
                <div className="flex items-center gap-2 text-sm text-emerald-600">
                  <CheckCircle className="h-4 w-4" />
                  No gaps or unrecognized codes found
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
