'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { searchAccounts } from '@/app/actions/accounts';
import { Input } from '@/components/ui/input';
import { Check } from 'lucide-react';

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
  const [results, setResults] = useState<{ id: string; display_name: string; city?: string | null; district?: string | null; agency_id?: string | null }[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const data = await searchAccounts(q);
    setResults(data);
    setShowDropdown(true);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search && !accountId) {
        doSearch(search);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [search, accountId, doSearch]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={accountId ? accountName : search}
        onChange={(e) => {
          setSearch(e.target.value);
          if (accountId) {
            onSelect('', '');
          }
        }}
        onFocus={() => {
          if (results.length > 0 && !accountId) {
            setShowDropdown(true);
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
      />
      {showDropdown && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
          {results.map((a) => (
            <button
              key={a.id}
              type="button"
              className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-muted"
              onClick={() => {
                onSelect(a.id, a.display_name);
                setShowDropdown(false);
                setSearch('');
              }}
            >
              <span>
                {a.display_name}
                {(a.city || a.district || a.agency_id) && (
                  <span className="ml-1 text-muted-foreground">
                    — {[a.agency_id, a.city, a.district].filter(Boolean).join(', ')}
                  </span>
                )}
              </span>
              {a.id === accountId && <Check className="h-4 w-4" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
