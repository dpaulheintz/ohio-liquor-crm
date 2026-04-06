'use client';

import { useState, useEffect, useCallback } from 'react';
import { searchAccounts } from '@/app/actions/accounts';

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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          width: '100%',
          height: '36px',
          padding: '0 12px',
          border: '1px solid #e2e2e2',
          borderRadius: '6px',
          backgroundColor: '#f9f9f9',
          fontSize: '14px',
        }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {accountName}
        </span>
        <button
          type="button"
          onClick={handleClear}
          style={{
            background: 'none',
            border: 'none',
            padding: '4px',
            cursor: 'pointer',
            fontSize: '16px',
            lineHeight: 1,
            color: '#666',
          }}
          aria-label="Clear selection"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Plain native input - no library wrappers */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onFocus={() => {
          if (results.length > 0) setOpen(true);
        }}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        style={{
          width: '100%',
          height: '36px',
          padding: '0 12px',
          border: '1px solid #e2e2e2',
          borderRadius: '6px',
          fontSize: '14px',
          outline: 'none',
          backgroundColor: 'white',
          WebkitAppearance: 'none',
          appearance: 'none',
        }}
      />

      {/* Search status */}
      {searching && (
        <div style={{
          position: 'absolute',
          right: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: '12px',
          color: '#999',
        }}>
          ...
        </div>
      )}

      {/* Results dropdown - plain HTML, no portals */}
      {open && results.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            maxHeight: '200px',
            overflowY: 'auto',
            backgroundColor: 'white',
            border: '1px solid #e2e2e2',
            borderRadius: '6px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 99999,
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {results.map((a) => {
            const details = [a.agency_id, a.city, a.district].filter(Boolean).join(', ');
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => handleSelect(a)}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  handleSelect(a);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '10px 12px',
                  border: 'none',
                  borderBottom: '1px solid #f0f0f0',
                  backgroundColor: 'transparent',
                  textAlign: 'left',
                  fontSize: '14px',
                  cursor: 'pointer',
                  WebkitTapHighlightColor: 'rgba(0,0,0,0.05)',
                }}
              >
                <div style={{ fontWeight: 500 }}>{a.display_name}</div>
                {details && (
                  <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                    {details}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
