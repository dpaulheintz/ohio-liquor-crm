'use client';

import { useState, useEffect, useCallback } from 'react';

export interface AccountResult {
  id: string;
  display_name: string;
  city?: string | null;
  district?: string | null;
  agency_id?: string | null;
}

export function useAccountSearch() {
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

  function reset() {
    setSearch('');
    setOpen(false);
    setResults([]);
  }

  return { search, setSearch, results, searching, open, setOpen, reset };
}
