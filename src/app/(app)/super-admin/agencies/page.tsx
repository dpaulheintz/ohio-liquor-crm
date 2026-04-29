'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  getSharedAgencies,
  createSharedAgency,
  updateSharedAgency,
  deleteSharedAgency,
} from '@/app/actions/super-admin';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Search, Pencil, Trash2, Layers, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

type Agency = {
  id: string;
  display_name: string;
  agency_id: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  warehouse: string | null;
  delivery_day: string | null;
};

const emptyForm = {
  display_name: '',
  agency_id: '',
  address: '',
  city: '',
  state: 'OH',
  zip: '',
  phone: '',
  warehouse: '',
  delivery_day: '',
};

export default function AgenciesPage() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 30;

  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<Agency | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Agency | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSharedAgencies({ search: search || undefined, page, pageSize });
      setAgencies(res.agencies as Agency[]);
      setTotal(res.total);
    } catch {
      toast.error('Failed to load agencies');
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => { fetch(); }, [fetch]);
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  function openCreate() {
    setEditTarget(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEdit(agency: Agency) {
    setEditTarget(agency);
    setForm({
      display_name: agency.display_name,
      agency_id: agency.agency_id ?? '',
      address: agency.address ?? '',
      city: agency.city ?? '',
      state: agency.state ?? 'OH',
      zip: agency.zip ?? '',
      phone: agency.phone ?? '',
      warehouse: agency.warehouse ?? '',
      delivery_day: agency.delivery_day ?? '',
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.display_name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const payload = {
        display_name: form.display_name.trim(),
        agency_id: form.agency_id.trim() || undefined,
        address: form.address.trim() || undefined,
        city: form.city.trim() || undefined,
        state: form.state.trim() || undefined,
        zip: form.zip.trim() || undefined,
        phone: form.phone.trim() || undefined,
        warehouse: form.warehouse.trim() || undefined,
        delivery_day: form.delivery_day.trim() || undefined,
      };
      if (editTarget) {
        await updateSharedAgency(editTarget.id, payload);
        toast.success('Agency updated');
      } else {
        await createSharedAgency(payload);
        toast.success('Agency created');
      }
      setShowForm(false);
      fetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSharedAgency(deleteTarget.id);
      toast.success(`${deleteTarget.display_name} deleted`);
      setDeleteTarget(null);
      fetch();
    } catch {
      toast.error('Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Shared Agencies</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total} agencies visible to all organizations
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Agency
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search agencies…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : agencies.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          <Layers className="mx-auto mb-3 h-10 w-10" />
          <p>No agencies found</p>
        </div>
      ) : (
        <div className="rounded-lg border divide-y">
          {agencies.map((agency) => (
            <div key={agency.id} className="flex items-center justify-between p-3 hover:bg-muted/30">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm truncate">{agency.display_name}</p>
                  {agency.agency_id && (
                    <Badge variant="outline" className="text-xs shrink-0">#{agency.agency_id}</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  {agency.city && <span>{agency.city}, {agency.state}</span>}
                  {agency.warehouse && <span>· {agency.warehouse}</span>}
                  {agency.delivery_day && <span>· {agency.delivery_day}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0 ml-2">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(agency)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(agency)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-1">
          <p className="text-sm text-muted-foreground">{total} agencies</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">{page} / {totalPages}</span>
            <Button variant="outline" size="icon" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Agency' : 'Add Shared Agency'}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2 space-y-1">
              <Label>Name *</Label>
              <Input value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} placeholder="Jungle Jim's" />
            </div>
            <div className="space-y-1">
              <Label>Agency ID</Label>
              <Input value={form.agency_id} onChange={e => setForm(f => ({ ...f, agency_id: e.target.value }))} placeholder="10100" />
            </div>
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="513-555-0100" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Address</Label>
              <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="4450 Eastgate S Dr" />
            </div>
            <div className="space-y-1">
              <Label>City</Label>
              <Input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} placeholder="Cincinnati" />
            </div>
            <div className="space-y-1">
              <Label>Zip</Label>
              <Input value={form.zip} onChange={e => setForm(f => ({ ...f, zip: e.target.value }))} placeholder="45245" />
            </div>
            <div className="space-y-1">
              <Label>Warehouse</Label>
              <Input value={form.warehouse} onChange={e => setForm(f => ({ ...f, warehouse: e.target.value }))} placeholder="GPT" />
            </div>
            <div className="space-y-1">
              <Label>Delivery Day</Label>
              <Input value={form.delivery_day} onChange={e => setForm(f => ({ ...f, delivery_day: e.target.value }))} placeholder="Wednesday" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : editTarget ? 'Save Changes' : 'Add Agency'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.display_name}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This removes the agency from the shared list. Visit history is not
            deleted but the account record will be gone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
