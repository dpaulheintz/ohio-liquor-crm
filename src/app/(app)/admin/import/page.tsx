'use client';

import { useState } from 'react';
import { validateAgencyCSV, processAgencyImport } from '@/app/actions/agency-import';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { FileUp, CheckCircle, AlertCircle } from 'lucide-react';

interface PreviewRow {
  agencyId: string;
  dba: string;
  city: string;
  deliveryDay: string;
  warehouse: string;
  primaryContact: string;
}

interface ImportResult {
  created: number;
  updated: number;
  skipped: number;
  contactsCreated: number;
  total: number;
}

export default function ImportAgenciesPage() {
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [totalRows, setTotalRows] = useState(0);
  const [createContacts, setCreateContacts] = useState(true);
  const [validationError, setValidationError] = useState('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setResult(null);
    setValidationError('');
    setPreview(null);

    const text = await file.text();
    setCsvText(text);

    const validation = await validateAgencyCSV(text);
    if (!validation.valid) {
      setValidationError(validation.error ?? 'Invalid CSV');
      return;
    }

    setPreview(validation.preview ?? []);
    setTotalRows(validation.totalRows ?? 0);
  }

  async function handleImport() {
    if (!csvText) return;

    setImporting(true);
    try {
      const importResult = await processAgencyImport(csvText, createContacts);
      setResult(importResult);
      setPreview(null);
    } catch (err) {
      console.error('Import failed:', err);
      setValidationError('Import failed. Please try again.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">Import Agencies</h1>
      <p className="text-sm text-muted-foreground">
        Upload a Partner Agencies CSV to create or update agency accounts. Existing accounts (matched by Agency ID) will be updated.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5" />
            Upload CSV
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="csv-file">CSV File</Label>
            <input
              id="csv-file"
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="block w-full text-sm file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
            />
            {fileName && (
              <p className="text-xs text-muted-foreground">{fileName}</p>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="create-contacts"
              checked={createContacts}
              onChange={(e) => setCreateContacts(e.target.checked)}
              className="rounded"
            />
            <Label htmlFor="create-contacts" className="text-sm font-normal cursor-pointer">
              Also create contacts from Primary Contact data
            </Label>
          </div>

          {validationError && (
            <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/20 p-3 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">{validationError}</p>
            </div>
          )}

          {preview && (
            <>
              <div className="text-sm font-medium">
                Preview ({totalRows} rows total)
              </div>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-2 py-1.5 text-left">Agency ID</th>
                      <th className="px-2 py-1.5 text-left">DBA</th>
                      <th className="px-2 py-1.5 text-left">City</th>
                      <th className="px-2 py-1.5 text-left">Delivery</th>
                      <th className="px-2 py-1.5 text-left">Warehouse</th>
                      <th className="px-2 py-1.5 text-left">Contact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="px-2 py-1.5">{row.agencyId}</td>
                        <td className="px-2 py-1.5">{row.dba}</td>
                        <td className="px-2 py-1.5">{row.city}</td>
                        <td className="px-2 py-1.5">{row.deliveryDay}</td>
                        <td className="px-2 py-1.5">{row.warehouse}</td>
                        <td className="px-2 py-1.5">{row.primaryContact}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Button onClick={handleImport} disabled={importing} className="w-full">
                {importing ? 'Importing...' : `Import ${totalRows} Agencies`}
              </Button>
            </>
          )}

          {result && (
            <div className="rounded-lg border border-green-300 bg-green-50 dark:bg-green-950/20 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="font-medium text-green-700 dark:text-green-300">Import Complete</span>
              </div>
              <div className="flex flex-wrap gap-3 text-sm">
                <Badge variant="default">{result.created} created</Badge>
                <Badge variant="secondary">{result.updated} updated</Badge>
                {result.skipped > 0 && (
                  <Badge variant="destructive">{result.skipped} skipped</Badge>
                )}
                {result.contactsCreated > 0 && (
                  <Badge variant="outline">{result.contactsCreated} contacts created</Badge>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
