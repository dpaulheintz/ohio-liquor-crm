'use client';

import { useState, useEffect, useCallback } from 'react';
import { getUnmatchedRecords, linkSalesDataToAccount } from '@/app/actions/csv-upload';
import { searchAccounts } from '@/app/actions/accounts';
import { SalesData } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { AlertCircle, Check, Link as LinkIcon } from 'lucide-react';
import { toast } from 'sonner';

export default function UnmatchedPage() {
  const [records, setRecords] = useState<SalesData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getUnmatchedRecords();
      setRecords(data);
    } catch (err) {
      console.error('Failed to fetch unmatched records:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold">Unmatched Records</h1>
      <p className="text-sm text-muted-foreground">
        CSV rows that could not be automatically matched to an account.
        Link them manually or create new accounts.
      </p>

      {loading ? (
        <p className="text-muted-foreground">Loading...</p>
      ) : records.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <AlertCircle className="mx-auto mb-3 h-10 w-10" />
          <p>No unmatched records</p>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map((record) => (
            <UnmatchedRow
              key={record.id}
              record={record}
              onLinked={fetchRecords}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UnmatchedRow({
  record,
  onLinked,
}: {
  record: SalesData;
  onLinked: () => void;
}) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<{ id: string; display_name: string }[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (search.length >= 2) {
        const data = await searchAccounts(search);
        setResults(data);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [search]);

  async function handleLink(accountId: string) {
    try {
      await linkSalesDataToAccount(record.id, accountId);
      toast.success('Record linked to account');
      setOpen(false);
      onLinked();
    } catch {
      toast.error('Failed to link record');
    }
  }

  return (
    <Card>
      <CardContent className="p-3 flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">
              {record.agency_name || record.wholesaler || 'Unknown'}
            </span>
            <Badge variant="outline" className="text-xs shrink-0">
              {record.data_source === 'annual_summary' ? 'Annual' : 'Wholesale'}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            {record.agency_id && <span>Agency: {record.agency_id}</span>}
            {record.permit_number && <span>Permit: {record.permit_number}</span>}
            {record.district && <span>District: {record.district}</span>}
          </div>
        </div>

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline">
              <LinkIcon className="mr-1 h-3 w-3" />
              Link
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="end">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search accounts..."
              className="mb-2"
            />
            {results.length > 0 ? (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {results.map((a) => (
                  <button
                    key={a.id}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
                    onClick={() => handleLink(a.id)}
                  >
                    <Check className="h-3 w-3 text-muted-foreground" />
                    {a.display_name}
                  </button>
                ))}
              </div>
            ) : search.length >= 2 ? (
              <p className="text-xs text-muted-foreground text-center py-2">
                No matches
              </p>
            ) : null}
          </PopoverContent>
        </Popover>
      </CardContent>
    </Card>
  );
}
