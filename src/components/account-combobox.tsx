'use client';

import { useState, useEffect, useCallback } from 'react';
import { searchAccounts } from '@/app/actions/accounts';
import { Input } from '@/components/ui/input';

interface AccountResult {
  id: string;
  display_name: string;
  city?: string | null;
  district?: string | null;
  agency_id?: string | null;
}

interface AccountComboboxProps {
  accountId: string;
  accountName: string;
  onSelect: (id: string, name: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function AccountCombobox({
  accountId,
  accountName,
  onSelect,
  disabled = false,
  placeholder = 'Search accounts...',
}: AccountComboboxProps) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<AccountResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const data = await searchAccounts(q);
      setResults(data);
      setOpen(true);
    } finally {
      setSearching(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (!search || accountId) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => doSearch(search), 250);
    return () => clearTimeout(timer);
  }, [search, accountId, doSearch]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-account-combobox]')) {
        setOpen(false);
      }
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [open]);

  function handleSelect(a: AccountResult) {
    onSelect(a.id, a.display_name);
    setSearch('');
    setOpen(false);
    setResults([]);
  }

  function handleClear() {
    onSelect('', '');
    setSearch('');
    setResults([]);
  }

  // If an account is selected, show it with a clear button
  if (accountId) {
    return (
      <div className="relative" data-account-combobox>
        <Input value={accountName} disabled readOnly />
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
          aria-label="Clear selection"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="relative" data-account-combobox>
      <Input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onFocus={() => {
          if (results.length > 0) setOpen(true);
        }}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
      />

      {/* Search indicator */}
      {searching && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          ...
        </span>
      )}

      {/* Results dropdown */}
      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[200px] overflow-y-auto rounded-md border bg-popover shadow-md">
          {results.map((a) => {
            const details = [a.agency_id, a.city, a.district].filter(Boolean).join(', ');
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => handleSelect(a)}
                className="block w-full border-b border-border/50 px-3 py-2.5 text-left text-sm hover:bg-accent"
              >
                <div className="font-medium">{a.display_name}</div>
                {details && (
                  <div className="mt-0.5 text-xs text-muted-foreground">{details}</div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
