'use client';

import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { searchAccounts } from '@/app/actions/accounts';
import { Input } from '@/components/ui/input';
import { Check } from 'lucide-react';
import { createPortal } from 'react-dom';

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
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  // Calculate dropdown position relative to viewport (fixed positioning)
  useLayoutEffect(() => {
    if (showDropdown && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
  }, [showDropdown, search, results]);

  // Close dropdown on outside click/touch
  useEffect(() => {
    if (!showDropdown) return;

    function handleClickOutside(e: MouseEvent | TouchEvent) {
      const target = e.target as Node;
      if (containerRef.current && !containerRef.current.contains(target)) {
        // Also check if click is inside the portaled dropdown
        const dropdown = document.getElementById('account-combobox-dropdown');
        if (dropdown && dropdown.contains(target)) return;
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showDropdown]);

  const dropdown = showDropdown && results.length > 0 && mounted ? createPortal(
    <div
      id="account-combobox-dropdown"
      className="fixed z-[9999] max-h-48 overflow-y-auto rounded-md border bg-popover p-1 shadow-lg"
      style={{
        top: dropdownPos.top,
        left: dropdownPos.left,
        width: dropdownPos.width,
      }}
    >
      {results.map((a) => (
        <button
          key={a.id}
          type="button"
          className="flex w-full items-center justify-between rounded px-2 py-2 text-sm hover:bg-muted active:bg-muted"
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
    </div>,
    document.body
  ) : null;

  return (
    <div ref={containerRef} className="relative">
      <Input
        ref={inputRef}
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
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />
      {dropdown}
    </div>
  );
}
