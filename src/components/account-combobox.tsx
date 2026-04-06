'use client';

import { useState, useEffect, useCallback } from 'react';
import { searchAccounts } from '@/app/actions/accounts';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

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
  const [open, setOpen] = useState(false);
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
      const data = await searchAccounts(q);
      setResults(data);
    } finally {
      setSearching(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      if (search) {
        doSearch(search);
      } else {
        setResults([]);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [search, open, doSearch]);

  // Reset search when popover closes
  useEffect(() => {
    if (!open) {
      setSearch('');
      setResults([]);
    }
  }, [open]);

  function formatSubtext(a: AccountResult) {
    const parts = [a.agency_id, a.city, a.district].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal h-9"
        >
          <span className={cn('truncate', !accountId && 'text-muted-foreground')}>
            {accountId ? accountName : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Type to search..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {search.length < 2 ? (
              <CommandEmpty>Type at least 2 characters to search</CommandEmpty>
            ) : searching ? (
              <CommandEmpty>Searching...</CommandEmpty>
            ) : results.length === 0 ? (
              <CommandEmpty>No accounts found</CommandEmpty>
            ) : (
              <CommandGroup>
                {results.map((a) => {
                  const subtext = formatSubtext(a);
                  return (
                    <CommandItem
                      key={a.id}
                      value={a.id}
                      onSelect={() => {
                        onSelect(a.id, a.display_name);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          accountId === a.id ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <div className="flex flex-col">
                        <span>{a.display_name}</span>
                        {subtext && (
                          <span className="text-xs text-muted-foreground">{subtext}</span>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
