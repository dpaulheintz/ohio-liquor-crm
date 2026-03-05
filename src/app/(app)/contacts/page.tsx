'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { getContacts } from '@/app/actions/contacts';
import { Contact, Account } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Users, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { QuickAddContact } from './quick-add-contact';

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);

  const pageSize = 20;

  const fetchContacts = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getContacts({
        search: search || undefined,
        page,
        pageSize,
      });
      setContacts(result.contacts);
      setTotal(result.total);
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Contacts</h1>
        <Button onClick={() => setShowAdd(true)} size="sm">
          <Plus className="mr-1 h-4 w-4" />
          Quick Add
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : contacts.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <Users className="mx-auto mb-3 h-10 w-10" />
          <p>No contacts found</p>
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map((contact) => {
            const acct = contact.account as unknown as Pick<Account, 'id' | 'display_name' | 'type'> | null;
            return (
              <div
                key={contact.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">{contact.name}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    {contact.title_role && <span>{contact.title_role}</span>}
                    {acct && (
                      <Link
                        href={`/accounts/${acct.id}`}
                        className="hover:underline text-primary"
                      >
                        {acct.display_name}
                      </Link>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground shrink-0">
                  {contact.phone && (
                    <a href={`tel:${contact.phone}`} className="hover:underline">
                      {contact.phone}
                    </a>
                  )}
                  {contact.email && (
                    <a href={`mailto:${contact.email}`} className="hover:underline hidden sm:inline">
                      {contact.email}
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-muted-foreground">
            {total} contact{total !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">{page} / {totalPages}</span>
            <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <QuickAddContact
        open={showAdd}
        onOpenChange={setShowAdd}
        onSuccess={fetchContacts}
      />
    </div>
  );
}
