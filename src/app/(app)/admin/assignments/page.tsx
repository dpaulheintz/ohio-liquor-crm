'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  getAllAssignments,
  createAssignment,
  completeAssignment,
  deleteAssignment,
} from '@/app/actions/assignments';
import { getReps, searchAccounts, createAccount } from '@/app/actions/accounts';
import { getContactsByAccount, createContact } from '@/app/actions/contacts';
import { Assignment, Profile } from '@/lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  ClipboardList,
  Plus,
  CheckCircle2,
  Clock,
  Trash2,
  Search,
  Building2,
  ChevronRight,
  ChevronDown,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatVisitDate } from '@/lib/date-utils';

type RepOption = Pick<Profile, 'id' | 'full_name' | 'email'>;
type AccountOption = { id: string; display_name: string; city: string | null; type: string };
type ContactOption = { id: string; name: string; phone: string | null; title_role: string | null };

export default function AdminAssignmentsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [repFilter, setRepFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [reps, setReps] = useState<RepOption[]>([]);

  // ── Dialog state ──────────────────────────────────────────────
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Step 1: Rep
  const [newRep, setNewRep] = useState('');

  // Step 2: Account — search existing
  const [newAccountSearch, setNewAccountSearch] = useState('');
  const [accountResults, setAccountResults] = useState<AccountOption[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<AccountOption | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // Step 2: Account — create new
  const [creatingNewAccount, setCreatingNewAccount] = useState(false);
  const [newAcctName, setNewAcctName] = useState('');
  const [newAcctAddress, setNewAcctAddress] = useState('');
  const [newAcctCity, setNewAcctCity] = useState('');
  const [newAcctZip, setNewAcctZip] = useState('');
  const [newAcctPhone, setNewAcctPhone] = useState('');
  const [newAcctPermitNumber, setNewAcctPermitNumber] = useState('');
  const [newAcctLinkedName, setNewAcctLinkedName] = useState('');
  const [newAcctLinkedId, setNewAcctLinkedId] = useState('');
  const [newAcctDistrict, setNewAcctDistrict] = useState('');

  // Step 3: Contact — existing contacts for selected account
  const [accountContacts, setAccountContacts] = useState<ContactOption[]>([]);
  const [selectedContactId, setSelectedContactId] = useState('');

  // Step 3: Contact — create new
  const [creatingNewContact, setCreatingNewContact] = useState(false);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newContactTitle, setNewContactTitle] = useState('');

  // Step 4: Notes
  const [newNotes, setNewNotes] = useState('');

  // ── Fetch assignments ─────────────────────────────────────────
  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAllAssignments({
        repId: repFilter !== 'all' ? repFilter : undefined,
        status: statusFilter,
      });
      setAssignments(result.assignments as unknown as Assignment[]);
      setTotal(result.total);
    } catch (err) {
      console.error('Failed to fetch assignments:', err);
      toast.error('Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }, [repFilter, statusFilter]);

  useEffect(() => { fetchAssignments(); }, [fetchAssignments]);
  useEffect(() => { getReps().then(setReps); }, []);

  // ── Account search (debounced) ────────────────────────────────
  useEffect(() => {
    if (!newAccountSearch.trim()) { setAccountResults([]); return; }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const results = await searchAccounts(newAccountSearch);
        setAccountResults(results as unknown as AccountOption[]);
      } finally {
        setSearchLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [newAccountSearch]);

  // ── Load existing contacts when an account is selected ────────
  useEffect(() => {
    if (!selectedAccount) { setAccountContacts([]); setSelectedContactId(''); return; }
    getContactsByAccount(selectedAccount.id)
      .then((data) => setAccountContacts(data as unknown as ContactOption[]))
      .catch(() => setAccountContacts([]));
  }, [selectedAccount]);

  // ── Reset all dialog state ────────────────────────────────────
  function resetDialog() {
    setNewRep('');
    setNewAccountSearch('');
    setAccountResults([]);
    setSelectedAccount(null);
    setCreatingNewAccount(false);
    setNewAcctName('');
    setNewAcctAddress('');
    setNewAcctCity('');
    setNewAcctZip('');
    setNewAcctPhone('');
    setNewAcctPermitNumber('');
    setNewAcctLinkedName('');
    setNewAcctLinkedId('');
    setNewAcctDistrict('');
    setAccountContacts([]);
    setSelectedContactId('');
    setCreatingNewContact(false);
    setNewContactName('');
    setNewContactPhone('');
    setNewContactEmail('');
    setNewContactTitle('');
    setNewNotes('');
  }

  function handleDialogOpenChange(open: boolean) {
    setDialogOpen(open);
    if (!open) resetDialog();
  }

  // ── Submit ────────────────────────────────────────────────────
  async function handleCreate() {
    if (!newRep) { toast.error('Select a rep to assign to'); return; }
    if (!selectedAccount && !(creatingNewAccount && newAcctName.trim())) {
      toast.error('Select or create an account'); return;
    }
    if (creatingNewContact && !newContactName.trim()) {
      toast.error('Enter a contact name or clear the contact section'); return;
    }

    setSaving(true);
    try {
      let resolvedAccountId = selectedAccount?.id ?? '';

      // Step 1: Create account if needed — claim under the assigned rep
      if (creatingNewAccount) {
        const fd = new FormData();
        fd.set('type', 'wholesale');
        fd.set('display_name', newAcctName.trim());
        if (newAcctPermitNumber) fd.set('permit_number', newAcctPermitNumber);
        if (newAcctAddress)      fd.set('address', newAcctAddress);
        if (newAcctCity)         fd.set('city', newAcctCity);
        if (newAcctZip)          fd.set('zip', newAcctZip);
        if (newAcctPhone)        fd.set('phone', newAcctPhone);
        if (newAcctLinkedName)   fd.set('linked_agency_name', newAcctLinkedName);
        if (newAcctLinkedId)     fd.set('linked_agency_id', newAcctLinkedId);
        if (newAcctDistrict)     fd.set('district', newAcctDistrict);

        const newAccount = await createAccount(fd, newRep);
        resolvedAccountId = newAccount.id;
      }

      // Step 2: Create contact if needed
      if (creatingNewContact && newContactName.trim()) {
        await createContact({
          name: newContactName.trim(),
          account_id: resolvedAccountId,
          phone: newContactPhone || undefined,
          email: newContactEmail || undefined,
          title_role: newContactTitle || undefined,
        });
      }

      // Step 3: Create the assignment
      await createAssignment({
        accountId: resolvedAccountId,
        assignedTo: newRep,
        notes: newNotes || undefined,
      });

      toast.success('Assignment created');
      handleDialogOpenChange(false);
      fetchAssignments();
    } catch (err) {
      toast.error('Failed to create assignment');
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  // ── Complete / Delete ─────────────────────────────────────────
  async function handleComplete(id: string) {
    try {
      await completeAssignment(id);
      toast.success('Marked as complete');
      fetchAssignments();
    } catch (err) {
      toast.error('Failed to update assignment');
      console.error(err);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteAssignment(id);
      toast.success('Assignment removed');
      fetchAssignments();
    } catch (err) {
      toast.error('Failed to delete assignment');
      console.error(err);
    }
  }

  const pending   = assignments.filter((a) => a.status === 'pending');
  const completed = assignments.filter((a) => a.status === 'completed');

  // Whether an account has been "confirmed" (selected OR name typed for new)
  const accountConfirmed = !!selectedAccount || (creatingNewAccount && newAcctName.trim().length > 0);

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6" /> Assignments
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total} total · {pending.length} pending
          </p>
        </div>

        <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> New Assignment
            </Button>
          </DialogTrigger>

          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Assignment</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">

              {/* ── Step 1: Rep ── */}
              <div className="space-y-1.5">
                <Label>Assign To *</Label>
                <Select value={newRep} onValueChange={setNewRep}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a rep" />
                  </SelectTrigger>
                  <SelectContent>
                    {reps.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.full_name || r.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* ── Step 2: Account ── */}
              <div className="space-y-2">
                <Label>Account *</Label>

                {/* Confirmed: show selected account pill */}
                {selectedAccount ? (
                  <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="font-medium truncate">{selectedAccount.display_name}</span>
                      {selectedAccount.city && (
                        <span className="text-muted-foreground text-xs shrink-0">{selectedAccount.city}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => { setSelectedAccount(null); setAccountContacts([]); setSelectedContactId(''); }}
                      className="ml-2 text-muted-foreground hover:text-foreground text-xs underline shrink-0"
                    >
                      Change
                    </button>
                  </div>
                ) : creatingNewAccount ? (
                  /* Creating new — show name as disabled summary field */
                  <Input
                    value={newAcctName}
                    disabled={!newAcctName}
                    placeholder="Fill in account name below"
                    className="text-muted-foreground"
                    readOnly
                  />
                ) : (
                  /* Search existing */
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-8"
                      placeholder="Search accounts…"
                      value={newAccountSearch}
                      onChange={(e) => setNewAccountSearch(e.target.value)}
                    />
                    {(accountResults.length > 0 || searchLoading) && (
                      <div className="absolute z-10 w-full mt-1 bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto">
                        {searchLoading ? (
                          <div className="p-2 text-sm text-muted-foreground">Searching…</div>
                        ) : (
                          accountResults.map((acct) => (
                            <button
                              key={acct.id}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                              onClick={() => {
                                setSelectedAccount(acct);
                                setNewAccountSearch('');
                                setAccountResults([]);
                                setCreatingNewAccount(false);
                              }}
                            >
                              <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                              <span className="font-medium">{acct.display_name}</span>
                              {acct.city && (
                                <span className="text-muted-foreground text-xs">{acct.city}</span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Toggle: create new account */}
                {!selectedAccount && (
                  <button
                    type="button"
                    onClick={() => {
                      setCreatingNewAccount(!creatingNewAccount);
                      if (!creatingNewAccount) {
                        setNewAccountSearch('');
                        setAccountResults([]);
                      }
                    }}
                    className="text-sm text-primary flex items-center gap-1 hover:underline"
                  >
                    {creatingNewAccount
                      ? <ChevronDown className="h-4 w-4" />
                      : <ChevronRight className="h-4 w-4" />}
                    Creating a new account?
                  </button>
                )}

                {/* New account fields (wholesale only — Bar/Restaurant) */}
                {creatingNewAccount && (
                  <div className="space-y-3 pl-3 border-l-2 border-primary/20">
                    <div className="space-y-1.5">
                      <Label>Name *</Label>
                      <Input
                        value={newAcctName}
                        onChange={(e) => setNewAcctName(e.target.value)}
                        placeholder="e.g., The Rusty Nail"
                        style={{ textTransform: 'capitalize' }}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Permit Number</Label>
                      <Input
                        value={newAcctPermitNumber}
                        onChange={(e) => setNewAcctPermitNumber(e.target.value)}
                        placeholder="State-assigned permit"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Agency Name</Label>
                        <Input
                          value={newAcctLinkedName}
                          onChange={(e) => setNewAcctLinkedName(e.target.value)}
                          placeholder="Parent agency"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Agency ID</Label>
                        <Input
                          value={newAcctLinkedId}
                          onChange={(e) => setNewAcctLinkedId(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Address</Label>
                      <Input
                        value={newAcctAddress}
                        onChange={(e) => setNewAcctAddress(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>City</Label>
                        <Input
                          value={newAcctCity}
                          onChange={(e) => setNewAcctCity(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>ZIP</Label>
                        <Input
                          value={newAcctZip}
                          onChange={(e) => setNewAcctZip(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label>Phone</Label>
                        <Input
                          value={newAcctPhone}
                          onChange={(e) => setNewAcctPhone(e.target.value)}
                          type="tel"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>District</Label>
                        <Input
                          value={newAcctDistrict}
                          onChange={(e) => setNewAcctDistrict(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Step 3: Contact (only once account is confirmed) ── */}
              {accountConfirmed && (
                <>
                  <Separator />

                  <div className="space-y-2">
                    <Label>Contact <span className="text-muted-foreground font-normal">(optional)</span></Label>

                    {/* Existing contacts for this account */}
                    {selectedAccount && accountContacts.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-xs text-muted-foreground">Existing contacts:</p>
                        <div className="space-y-1">
                          {accountContacts.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setSelectedContactId(
                                selectedContactId === c.id ? '' : c.id
                              )}
                              className={`w-full text-left rounded-md border px-3 py-2 text-sm transition-colors flex items-center gap-2 ${
                                selectedContactId === c.id
                                  ? 'border-primary bg-primary/5 text-primary'
                                  : 'hover:bg-muted'
                              }`}
                            >
                              <User className="h-3.5 w-3.5 shrink-0" />
                              <span className="font-medium flex-1">{c.name}</span>
                              {c.title_role && (
                                <span className="text-xs text-muted-foreground">{c.title_role}</span>
                              )}
                              {c.phone && (
                                <span className="text-xs text-muted-foreground">{c.phone}</span>
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Toggle: create new contact */}
                    <button
                      type="button"
                      onClick={() => setCreatingNewContact(!creatingNewContact)}
                      className="text-sm text-primary flex items-center gap-1 hover:underline"
                    >
                      {creatingNewContact
                        ? <ChevronDown className="h-4 w-4" />
                        : <ChevronRight className="h-4 w-4" />}
                      {selectedAccount && accountContacts.length > 0
                        ? 'Add a new contact instead?'
                        : 'Add a contact?'}
                    </button>

                    {/* New contact fields */}
                    {creatingNewContact && (
                      <div className="space-y-3 pl-3 border-l-2 border-primary/20">
                        <div className="space-y-1.5">
                          <Label>Name *</Label>
                          <Input
                            value={newContactName}
                            onChange={(e) => setNewContactName(e.target.value)}
                            placeholder="Full name"
                            style={{ textTransform: 'capitalize' }}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label>Phone</Label>
                            <Input
                              value={newContactPhone}
                              onChange={(e) => setNewContactPhone(e.target.value)}
                              type="tel"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label>Email</Label>
                            <Input
                              value={newContactEmail}
                              onChange={(e) => setNewContactEmail(e.target.value)}
                              type="email"
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Title / Role</Label>
                          <Input
                            value={newContactTitle}
                            onChange={(e) => setNewContactTitle(e.target.value)}
                            placeholder="e.g., Bar Manager"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              <Separator />

              {/* ── Step 4: Notes ── */}
              <div className="space-y-1.5">
                <Label>
                  Notes <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Context for the rep…"
                  rows={3}
                  maxLength={1000}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => handleDialogOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={saving || !newRep || !accountConfirmed}
                >
                  {saving ? 'Creating…' : 'Create'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-3">
        <Select value={repFilter} onValueChange={setRepFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All Reps" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Reps</SelectItem>
            {reps.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.full_name || r.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── Assignment list ── */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : assignments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No assignments found.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {(statusFilter === 'all' || statusFilter === 'pending') && pending.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Pending ({pending.length})
              </h2>
              <div className="space-y-2">
                {pending.map((a) => (
                  <AssignmentCard
                    key={a.id}
                    assignment={a}
                    onComplete={handleComplete}
                    onDelete={handleDelete}
                    isAdmin
                  />
                ))}
              </div>
            </section>
          )}

          {(statusFilter === 'all' || statusFilter === 'completed') && completed.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Completed ({completed.length})
              </h2>
              <div className="space-y-2">
                {completed.map((a) => (
                  <AssignmentCard
                    key={a.id}
                    assignment={a}
                    onComplete={handleComplete}
                    onDelete={handleDelete}
                    isAdmin
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function AssignmentCard({
  assignment: a,
  onComplete,
  onDelete,
  isAdmin = false,
}: {
  assignment: Assignment;
  onComplete?: (id: string) => void;
  onDelete?: (id: string) => void;
  isAdmin?: boolean;
}) {
  const isDone = a.status === 'completed';
  const account  = a.account  as { id: string; display_name: string; city?: string | null } | undefined;
  const rep      = a.rep      as { id: string; full_name: string | null; email: string } | undefined;
  const assigner = a.assigner as { id: string; full_name: string | null; email: string } | undefined;

  return (
    <Card className={isDone ? 'opacity-60' : ''}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {account ? (
                <Link
                  href={`/accounts/${account.id}`}
                  className="font-semibold text-sm hover:underline text-primary"
                >
                  {account.display_name}
                </Link>
              ) : (
                <span className="font-semibold text-sm">Unknown account</span>
              )}
              {account?.city && (
                <span className="text-xs text-muted-foreground">{account.city}</span>
              )}
              <Badge variant={isDone ? 'secondary' : 'default'} className="text-[10px]">
                {isDone ? 'Completed' : 'Pending'}
              </Badge>
            </div>

            {isAdmin && rep && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Assigned to <span className="font-medium">{rep.full_name || rep.email}</span>
                {assigner && <> · by {assigner.full_name || assigner.email}</>}
              </p>
            )}

            {a.notes && (
              <p className="text-xs text-muted-foreground mt-1 italic">{a.notes}</p>
            )}

            <p className="text-[10px] text-muted-foreground mt-1">
              {isDone && a.completed_at
                ? `Completed ${formatVisitDate(a.completed_at)}`
                : `Assigned ${formatVisitDate(a.created_at)}`}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {!isDone && onComplete && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() => onComplete(a.id)}
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Done
              </Button>
            )}
            {isAdmin && onDelete && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                onClick={() => onDelete(a.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
