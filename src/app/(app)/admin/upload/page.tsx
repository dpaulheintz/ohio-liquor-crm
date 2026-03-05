'use client';

import { useState, useRef } from 'react';
import { validateCSV, processCSVUpload, getUploadBatches, deleteUploadBatch } from '@/app/actions/csv-upload';
import { UploadBatch, Profile } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Upload, Trash2, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useEffect, useCallback } from 'react';
import { format } from 'date-fns';

export default function UploadPage() {
  const [dataSource, setDataSource] = useState<'annual_summary' | 'wholesale'>('annual_summary');
  const [uploadPeriod, setUploadPeriod] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [csvText, setCsvText] = useState('');
  const [validation, setValidation] = useState<{
    valid: boolean;
    error: string | null;
    preview: Record<string, string>[];
    totalRows: number;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [batches, setBatches] = useState<UploadBatch[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchBatches = useCallback(async () => {
    try {
      const data = await getUploadBatches();
      setBatches(data);
    } catch (err) {
      console.error('Failed to fetch batches:', err);
    }
  }, []);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    const text = await selectedFile.text();
    setCsvText(text);

    try {
      const result = await validateCSV(text, dataSource);
      setValidation(result);
    } catch {
      setValidation({ valid: false, error: 'Failed to parse CSV', preview: [], totalRows: 0 });
    }
  }

  async function handleUpload() {
    if (!file || !csvText || !validation?.valid || !uploadPeriod) return;

    setUploading(true);
    try {
      const result = await processCSVUpload({
        csvText,
        dataSource,
        uploadPeriod,
        fileName: file.name,
      });

      toast.success(
        `Uploaded ${result.totalRows} rows. ${result.matchedCount} matched, ${result.unmatchedCount} unmatched.`
      );

      // Reset
      setFile(null);
      setCsvText('');
      setValidation(null);
      setUploadPeriod('');
      if (fileRef.current) fileRef.current.value = '';
      fetchBatches();
    } catch (err) {
      console.error('Upload failed:', err);
      toast.error('Upload failed. Check the console for details.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteBatch(batchId: string) {
    if (!confirm('Delete this upload batch and all its data? This cannot be undone.')) return;

    try {
      await deleteUploadBatch(batchId);
      toast.success('Batch deleted');
      fetchBatches();
    } catch {
      toast.error('Failed to delete batch');
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold">CSV Data Upload</h1>

      {/* Upload Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Upload className="h-5 w-5" />
            Upload State Sales Data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Data Type</Label>
              <Select
                value={dataSource}
                onValueChange={(v) => {
                  setDataSource(v as 'annual_summary' | 'wholesale');
                  setValidation(null);
                  setFile(null);
                  if (fileRef.current) fileRef.current.value = '';
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="annual_summary">Annual Sales Summary</SelectItem>
                  <SelectItem value="wholesale">Wholesale</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="upload_period">Upload Period</Label>
              <Input
                id="upload_period"
                value={uploadPeriod}
                onChange={(e) => setUploadPeriod(e.target.value)}
                placeholder="e.g., 2025-rolling-12"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>CSV File</Label>
            <Input
              ref={fileRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
            />
          </div>

          {/* Validation Result */}
          {validation && (
            <div className="space-y-3">
              {validation.valid ? (
                <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                  <CheckCircle className="h-4 w-4" />
                  <span>
                    Valid CSV — {validation.totalRows} rows ready to upload
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4" />
                  <span>{validation.error}</span>
                </div>
              )}

              {/* Preview Table */}
              {validation.preview.length > 0 && (
                <div className="rounded-md border overflow-x-auto max-h-64">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {Object.keys(validation.preview[0]).map((key) => (
                          <TableHead key={key} className="text-xs whitespace-nowrap">
                            {key}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validation.preview.map((row, i) => (
                        <TableRow key={i}>
                          {Object.values(row).map((val, j) => (
                            <TableCell key={j} className="text-xs whitespace-nowrap">
                              {val}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          <Button
            onClick={handleUpload}
            disabled={!validation?.valid || !uploadPeriod || uploading}
            className="w-full sm:w-auto"
          >
            {uploading ? 'Processing...' : 'Upload & Process'}
          </Button>
        </CardContent>
      </Card>

      <Separator />

      {/* Upload History */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Upload History</h2>

        {batches.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <FileSpreadsheet className="mx-auto mb-3 h-10 w-10" />
            <p>No uploads yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {batches.map((batch) => {
              const uploader = batch.uploader as unknown as Pick<Profile, 'full_name' | 'email'> | null;
              const matchRate =
                batch.row_count > 0
                  ? Math.round((batch.matched_count / batch.row_count) * 100)
                  : 0;
              return (
                <Card key={batch.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{batch.file_name}</span>
                        <Badge variant="outline" className="text-xs">
                          {batch.data_source === 'annual_summary'
                            ? 'Annual'
                            : 'Wholesale'}
                        </Badge>
                        <Badge
                          variant={batch.status === 'processed' ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {batch.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>Period: {batch.upload_period}</span>
                        <span>{batch.row_count} rows</span>
                        <span>{matchRate}% matched</span>
                        <span>
                          {format(new Date(batch.created_at), 'MMM d, yyyy h:mm a')}
                        </span>
                        {uploader && (
                          <span>by {uploader.full_name || uploader.email}</span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteBatch(batch.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
