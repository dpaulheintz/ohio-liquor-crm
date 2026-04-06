'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search } from 'lucide-react';

interface AccountResult {
  id: string;
  display_name: string;
  city?: string | null;
  district?: string | null;
  agency_id?: string | null;
}

interface AccountSearchDialogProps {
  accountId: string;
  accountName: string;
  onSelect: (id: string, name: string) => void;
}

export function AccountSearchDialog({
  accountId,
  accountName,
  onSelect,
}: AccountSearchDialogProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<AccountResult[]>([]);
  const [searching, setSearching] = useState(false);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const { searchAccounts } = await import('@/app/actions/accounts');
      const data = await searchAccounts(q);
      setResults(data);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!search) {
      if (results.length > 0) setResults([]);
      return;
    }
    const timer = setTimeout(() => doSearch(search), 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, doSearch]);

  // Reset search when dialog opens
  useEffect(() => {
    if (dialogOpen) {
      setSearch('');
      setResults([]);
    }
  }, [dialogOpen]);

  function handleSelect(a: AccountResult) {
    onSelect(a.id, a.display_name);
    setDialogOpen(false);
  }

  function handleClear() {
    onSelect('', '');
  }

  return (
    <>
      {/* Trigger: looks like an input but is a button */}
      {accountId ? (
        <div className="flex h-9 w-full items-center rounded-md border border-input bg-transparent px-3 text-base md:text-sm">
          <span className="flex-1 truncate">{accountName}</span>
          <button
            type="button"
            onClick={handleClear}
            className="ml-2 p-1 text-muted-foreground hover:text-foreground"
            aria-label="Clear selection"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="flex h-9 w-full items-center rounded-md border border-input bg-transparent px-3 text-base text-muted-foreground md:text-sm"
        >
          <Search className="mr-2 h-4 w-4" />
          Tap to search accounts...
        </button>
      )}

      {/* Search dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Search Accounts</DialogTitle>
          </DialogHeader>

          <Input
            id="acct-dialog-search"
            name="store-lookup"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Type account name..."
            autoFocus
          />

          <div className="max-h-[300px] overflow-y-auto">
            {searching && (
              <p className="py-4 text-center text-sm text-muted-foreground">Searching...</p>
            )}

            {!searching && search.length >= 2 && results.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">No accounts found</p>
            )}

            {!searching && search.length > 0 && search.length < 2 && (
              <p className="py-4 text-center text-sm text-muted-foreground">Type at least 2 characters</p>
            )}

            {results.map((a) => {
              const details = [a.agency_id, a.city, a.district].filter(Boolean).join(', ');
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => handleSelect(a)}
                  className="block w-full border-b border-border/50 px-3 py-3 text-left text-sm hover:bg-accent"
                >
                  <div className="font-medium">{a.display_name}</div>
                  {details && (
                    <div className="mt-0.5 text-xs text-muted-foreground">{details}</div>
                  )}
                </button>
              );
            })}
          </div>

          <Button variant="outline" onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
