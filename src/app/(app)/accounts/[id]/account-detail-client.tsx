'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Account, Contact, VisitLog, Tasting, Profile } from '@/lib/types';
import { claimAccount, releaseAccount, approveAccount, getAccount } from '@/app/actions/accounts';
import { getContactsByAccount } from '@/app/actions/contacts';
import { getVisitsByAccount } from '@/app/actions/visits';
import { getTastingsByAgency } from '@/app/actions/tastings';
import { useUser } from '@/hooks/useUser';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import {
  ArrowLeft,
  MapPin,
  Phone,
  UserCheck,
  UserX,
  CheckCircle,
  Plus,
  Camera,
  GlassWater,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { AccountFormDialog } from '../account-form-dialog';
import { QuickAddContact } from '../../contacts/quick-add-contact';
import { VisitCard } from '../../visits/visit-card';
import { EditVisitDialog } from '../../visits/edit-visit-dialog';
import { TastingFormDialog } from '../../admin/tastings/tasting-form-dialog';
import { statusConfig, formatTime } from '../../admin/tastings/tasting-utils';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';

interface AccountDetailClientProps {
  account: Account;
}

export function AccountDetailClient({ account: initialAccount }: AccountDetailClientProps) {
  const router = useRouter();
  const { profile } = useUser();
  const [account, setAccount] = useState(initialAccount);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [visits, setVisits] = useState<VisitLog[]>([]);
  const [tastings, setTastings] = useState<Tasting[]>([]);
  const [showEdit, setShowEdit] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showAddTasting, setShowAddTasting] = useState(false);
  const [editingVisit, setEditingVisit] = useState<VisitLog | null>(null);

  const ownerRep = account.owner_rep ?? null;
  const isOwner = profile?.id === ownerRep?.id;
  const isUnowned = !account.owner_rep_id;

  const refreshAccount = useCallback(async () => {
    const updated = await getAccount(account.id);
    setAccount(updated);
  }, [account.id]);

  const fetchContacts = useCallback(async () => {
    const data = await getContactsByAccount(account.id);
    setContacts(data);
  }, [account.id]);

  const fetchVisits = useCallback(async () => {
    const data = await getVisitsByAccount(account.id);
    setVisits(data);
  }, [account.id]);

  const fetchTastings = useCallback(async () => {
    if (account.type !== 'agency') return;
    const data = await getTastingsByAgency(account.id);
    setTastings(data as Tasting[]);
  }, [account.id, account.type]);

  useEffect(() => {
    fetchContacts();
    fetchVisits();
    fetchTastings();
  }, [fetchContacts, fetchVisits, fetchTastings]);

  async function handleClaim() {
    try {
      await claimAccount(account.id);
      toast.success('Account claimed');
      refreshAccount();
    } catch {
      toast.error('Failed to claim account');
    }
  }

  async function handleRelease() {
    try {
      await releaseAccount(account.id);
      toast.success('Account released');
      refreshAccount();
    } catch {
      toast.error('Failed to release account');
    }
  }

  async function handleApprove() {
    try {
      await approveAccount(account.id);
      toast.success('Account approved');
      refreshAccount();
    } catch {
      toast.error('Failed to approve account');
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-3xl mx-auto">
      <Button variant="ghost" size="sm" onClick={() => router.back()}>
        <ArrowLeft className="mr-1 h-4 w-4" />
        Back
      </Button>

      {/* Review Banner */}
      {account.needs_review && (
        <div className="rounded-lg border border-orange-300 bg-orange-50 dark:bg-orange-950/20 p-3 flex items-center justify-between">
          <p className="text-sm text-orange-800 dark:text-orange-200">
            This account was auto-created from CSV data. Please review.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowEdit(true)}>
              Edit
            </Button>
            <Button size="sm" onClick={handleApprove}>
              <CheckCircle className="mr-1 h-4 w-4" /> Approve
            </Button>
          </div>
        </div>
      )}

      {/* Header Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <CardTitle className="text-xl">{account.display_name}</CardTitle>
                <Badge variant={account.type === 'agency' ? 'default' : 'secondary'}>
                  {account.type === 'agency' ? 'Agency' : 'Wholesale'}
                </Badge>
                {account.type === 'wholesale' && (
                  <Badge variant={account.status === 'prospect' ? 'outline' : 'default'}>
                    {account.status === 'prospect' ? 'Prospect' : 'Customer'}
                  </Badge>
                )}
              </div>
              {account.legal_name && account.legal_name !== account.display_name && (
                <p className="text-sm text-muted-foreground">{account.legal_name}</p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
              Edit
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-4 text-sm">
            {account.district && (
              <span className="text-muted-foreground">District: <strong>{account.district}</strong></span>
            )}
            {account.agency_id && (
              <span className="text-muted-foreground">Agency ID: <strong>{account.agency_id}</strong></span>
            )}
            {account.permit_number && (
              <span className="text-muted-foreground">Permit: <strong>{account.permit_number}</strong></span>
            )}
            {account.delivery_day && (
              <span className="text-muted-foreground">Delivery: <strong>{account.delivery_day}</strong></span>
            )}
            {account.warehouse && (
              <span className="text-muted-foreground">Warehouse: <strong>{account.warehouse}</strong></span>
            )}
            {account.linked_agency_name && (
              <span className="text-muted-foreground">Agency: <strong>{account.linked_agency_name}</strong></span>
            )}
            {account.linked_agency_id && (
              <span className="text-muted-foreground">Agency ID: <strong>{account.linked_agency_id}</strong></span>
            )}
          </div>

          {(account.address || account.city) && (
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <span>
                {[account.address, account.city, account.state, account.zip]
                  .filter(Boolean)
                  .join(', ')}
              </span>
            </div>
          )}

          {account.phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <a href={`tel:${account.phone}`} className="hover:underline">
                {account.phone}
              </a>
            </div>
          )}

          <Separator />

          <div className="flex items-center justify-between">
            <div className="text-sm">
              <span className="text-muted-foreground">Assigned to: </span>
              {ownerRep ? (
                <strong>{ownerRep.full_name || ownerRep.email}</strong>
              ) : (
                <span className="text-muted-foreground italic">Unassigned</span>
              )}
            </div>
            {isUnowned ? (
              <Button size="sm" variant="outline" onClick={handleClaim}>
                <UserCheck className="mr-1 h-4 w-4" /> Claim
              </Button>
            ) : isOwner ? (
              <Button size="sm" variant="ghost" onClick={handleRelease}>
                <UserX className="mr-1 h-4 w-4" /> Release
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="contacts">
        <TabsList className="w-full">
          <TabsTrigger value="contacts" className="flex-1">
            Contacts ({contacts.length})
          </TabsTrigger>
          <TabsTrigger value="visits" className="flex-1">
            Visits ({visits.length})
          </TabsTrigger>
          {account.type === 'agency' && (
            <TabsTrigger value="tastings" className="flex-1">
              Tastings ({tastings.length})
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="contacts" className="mt-4 space-y-3">
          <Button size="sm" onClick={() => setShowAddContact(true)}>
            <Plus className="mr-1 h-4 w-4" /> Quick Add Contact
          </Button>

          {contacts.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No contacts yet
            </p>
          ) : (
            <div className="space-y-2">
              {contacts.map((contact) => (
                <Link
                  key={contact.id}
                  href={`/contacts/${contact.id}`}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                >
                  <div>
                    <p className="font-medium">{contact.name}</p>
                    {contact.title_role && (
                      <p className="text-xs text-muted-foreground">
                        {contact.title_role}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {contact.phone && <span>{contact.phone}</span>}
                    {contact.email && <span>{contact.email}</span>}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="visits" className="mt-4 space-y-3">
          <Link href={`/visits/new?account=${account.id}`}>
            <Button size="sm">
              <Camera className="mr-1 h-4 w-4" /> Log Visit
            </Button>
          </Link>

          {visits.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No visits logged yet
            </p>
          ) : (
            <div className="space-y-3">
              {visits.map((visit) => (
                <VisitCard key={visit.id} visit={visit} showAccount={false} onClick={() => setEditingVisit(visit)} />
              ))}
            </div>
          )}
        </TabsContent>

        {account.type === 'agency' && (
          <TabsContent value="tastings" className="mt-4 space-y-3">
            <Button size="sm" onClick={() => setShowAddTasting(true)}>
              <GlassWater className="mr-1 h-4 w-4" /> Schedule Tasting
            </Button>

            {tastings.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No tastings scheduled
              </p>
            ) : (
              <div className="space-y-2">
                {tastings.map((tasting) => {
                  const sc = statusConfig(tasting.status);
                  const isPast =
                    tasting.status === 'completed' || tasting.status === 'cancelled';
                  return (
                    <div
                      key={tasting.id}
                      className="rounded-lg border p-3 space-y-1"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium">
                            {format(parseISO(tasting.date), 'EEE, MMM d, yyyy')}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatTime(tasting.start_time)} –{' '}
                            {formatTime(tasting.end_time)}
                          </p>
                          {tasting.staff_category && (
                            <p className="text-xs text-muted-foreground">
                              {tasting.staff_category}
                              {tasting.staff_person
                                ? ` — ${tasting.staff_person}`
                                : ''}
                            </p>
                          )}
                          {tasting.notes && (
                            <p className="text-xs text-muted-foreground line-clamp-1">
                              {tasting.notes}
                            </p>
                          )}
                        </div>
                        <span
                          className={cn(
                            'shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                            sc.className
                          )}
                        >
                          {sc.label}
                        </span>
                      </div>
                      {isPast && tasting.report_url && (
                        <a
                          href={tasting.report_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <FileText className="h-3 w-3" /> View Report{' '}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      <AccountFormDialog
        open={showEdit}
        onOpenChange={setShowEdit}
        onSuccess={refreshAccount}
        account={account}
      />

      <QuickAddContact
        open={showAddContact}
        onOpenChange={setShowAddContact}
        onSuccess={fetchContacts}
        defaultAccountId={account.id}
        defaultAccountName={account.display_name}
      />

      <EditVisitDialog
        visit={editingVisit}
        open={!!editingVisit}
        onOpenChange={(open) => { if (!open) setEditingVisit(null); }}
        onSuccess={fetchVisits}
      />

      {account.type === 'agency' && (
        <TastingFormDialog
          open={showAddTasting}
          onOpenChange={setShowAddTasting}
          onSuccess={fetchTastings}
          defaultAgencyId={account.id}
          defaultAgencyName={account.display_name}
          defaultCity={account.city ?? undefined}
        />
      )}
    </div>
  );
}
