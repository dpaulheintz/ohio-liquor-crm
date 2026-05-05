'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { createTasting, updateTasting } from '@/app/actions/tastings';
import { searchAccounts } from '@/app/actions/accounts';
import type { Tasting } from '@/lib/types';
import { addHours, deriveStatus, statusConfig } from './tasting-utils';
import { cn } from '@/lib/utils';
import { Plus, Trash2 } from 'lucide-react';

type AgencyOption = {
  id: string;
  display_name: string;
  city: string | null;
  agency_id: string | null;
};

interface BulkRow {
  agencyIdInput: string;
  agencySearch: string;
  agencyResults: AgencyOption[];
  selectedAgency: AgencyOption | null;
  searchMode: 'id' | 'name';
  date: string;
  startTime: string;
  endTime: string;
}

function emptyRow(): BulkRow {
  return {
    agencyIdInput: '',
    agencySearch: '',
    agencyResults: [],
    selectedAgency: null,
    searchMode: 'id',
    date: '',
    startTime: '',
    endTime: '',
  };
}

interface TastingFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  tasting?: Tasting;
  defaultAgencyId?: string;
  defaultAgencyName?: string;
  defaultCity?: string;
}

export function TastingFormDialog({
  open,
  onOpenChange,
  onSuccess,
  tasting,
  defaultAgencyId,
  defaultAgencyName,
  defaultCity,
}: TastingFormDialogProps) {
  const isEdit = !!tasting;
  const [isBulk, setIsBulk] = useState(false);

  // --- Single-create state ---
  const [agencyIdInput, setAgencyIdInput] = useState('');
  const [agencySearch, setAgencySearch] = useState('');
  const [agencyResults, setAgencyResults] = useState<AgencyOption[]>([]);
  const [selectedAgency, setSelectedAgency] = useState<AgencyOption | null>(null);
  const [searchMode, setSearchMode] = useState<'id' | 'name'>('id');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [city, setCity] = useState('');
  const [staffCategory, setStaffCategory] = useState('');
  const [staffPerson, setStaffPerson] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // --- Bulk-create state ---
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([emptyRow()]);
  const [bulkStaffCategory, setBulkStaffCategory] = useState('');
  const [bulkStaffPerson, setBulkStaffPerson] = useState('');
  const [bulkNotes, setBulkNotes] = useState('');

  // Populate from tasting when editing
  useEffect(() => {
    if (!open) return;
    if (tasting) {
      setSelectedAgency(
        tasting.agency
          ? {
              id: tasting.agency_id,
              display_name: tasting.agency.display_name,
              city: tasting.agency.city ?? null,
              agency_id: tasting.agency.agency_id ?? null,
            }
          : null
      );
      setDate(tasting.date);
      setStartTime(tasting.start_time.slice(0, 5));
      setEndTime(tasting.end_time.slice(0, 5));
      setCity(tasting.city ?? '');
      setStaffCategory(tasting.staff_category ?? '');
      setStaffPerson(tasting.staff_person ?? '');
      setNotes(tasting.notes ?? '');
    } else {
      // Reset for create
      setSelectedAgency(
        defaultAgencyId && defaultAgencyName
          ? { id: defaultAgencyId, display_name: defaultAgencyName, city: defaultCity ?? null, agency_id: null }
          : null
      );
      setAgencyIdInput('');
      setAgencySearch('');
      setAgencyResults([]);
      setSearchMode('id');
      setDate('');
      setStartTime('');
      setEndTime('');
      setCity(defaultCity ?? '');
      setStaffCategory('');
      setStaffPerson('');
      setNotes('');
      setBulkRows([emptyRow()]);
      setBulkStaffCategory('');
      setBulkStaffPerson('');
      setBulkNotes('');
      setIsBulk(false);
    }
  }, [open, tasting, defaultAgencyId, defaultAgencyName, defaultCity]);

  // Agency name search (debounced)
  useEffect(() => {
    if (searchMode !== 'name' || agencySearch.length < 2) {
      setAgencyResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await searchAccounts(agencySearch);
        setAgencyResults(res.filter((r) => r.type === 'agency') as AgencyOption[]);
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [agencySearch, searchMode]);

  async function lookupAgencyById() {
    if (!agencyIdInput.trim()) return;
    try {
      const results = await searchAccounts(agencyIdInput.trim());
      const match = results.find(
        (r) => r.agency_id === agencyIdInput.trim() && r.type === 'agency'
      ) as AgencyOption | undefined;
      if (match) {
        setSelectedAgency(match);
        setCity(match.city ?? '');
        toast.success(`Found: ${match.display_name}`);
      } else {
        toast.error('No agency found with that ID');
      }
    } catch {
      toast.error('Agency lookup failed');
    }
  }

  function handleStartTimeChange(t: string) {
    setStartTime(t);
    if (t) setEndTime(addHours(t, 2));
  }

  // --- Bulk row helpers ---
  function updateBulkRow(idx: number, patch: Partial<BulkRow>) {
    setBulkRows((rows) =>
      rows.map((r, i) => (i === idx ? { ...r, ...patch } : r))
    );
  }

  async function lookupBulkAgencyById(idx: number) {
    const row = bulkRows[idx];
    if (!row.agencyIdInput.trim()) return;
    try {
      const results = await searchAccounts(row.agencyIdInput.trim());
      const match = results.find(
        (r) => r.agency_id === row.agencyIdInput.trim() && r.type === 'agency'
      ) as AgencyOption | undefined;
      if (match) {
        updateBulkRow(idx, { selectedAgency: match });
        toast.success(`Found: ${match.display_name}`);
      } else {
        toast.error('No agency found with that ID');
      }
    } catch {
      toast.error('Agency lookup failed');
    }
  }

  // --- Save single ---
  async function handleSave() {
    if (!selectedAgency) { toast.error('Select an agency'); return; }
    if (!date) { toast.error('Enter a date'); return; }
    if (!startTime || !endTime) { toast.error('Enter start and end time'); return; }

    setSaving(true);
    try {
      const payload = {
        agencyId: selectedAgency.id,
        date,
        startTime,
        endTime,
        city: city || selectedAgency.city || undefined,
        staffCategory: staffCategory || undefined,
        staffPerson: staffPerson || undefined,
        notes: notes || undefined,
      };
      if (isEdit && tasting) {
        await updateTasting(tasting.id, payload);
        toast.success('Tasting updated');
      } else {
        await createTasting(payload);
        toast.success('Tasting created');
      }
      onSuccess();
      onOpenChange(false);
    } catch {
      toast.error(isEdit ? 'Failed to update tasting' : 'Failed to create tasting');
    } finally {
      setSaving(false);
    }
  }

  // --- Save bulk ---
  async function handleSaveBulk() {
    const valid = bulkRows.filter(
      (r) => r.selectedAgency && r.date && r.startTime && r.endTime
    );
    if (valid.length === 0) {
      toast.error('Fill in at least one complete row');
      return;
    }
    setSaving(true);
    try {
      await Promise.all(
        valid.map((r) =>
          createTasting({
            agencyId: r.selectedAgency!.id,
            date: r.date,
            startTime: r.startTime,
            endTime: r.endTime,
            city: r.selectedAgency!.city ?? undefined,
            staffCategory: bulkStaffCategory || undefined,
            staffPerson: bulkStaffPerson || undefined,
            notes: bulkNotes || undefined,
          })
        )
      );
      toast.success(`Created ${valid.length} tastings`);
      onSuccess();
      onOpenChange(false);
    } catch {
      toast.error('Failed to create tastings');
    } finally {
      setSaving(false);
    }
  }

  const derivedStatus = deriveStatus(staffCategory, staffPerson);

  // ---- Agency picker sub-component (shared between single and bulk) ----
  function AgencyPicker({
    selected,
    onSelect,
    onClear,
    searchModeState,
    onSearchModeChange,
    agencyIdVal,
    onAgencyIdChange,
    onLookup,
    searchVal,
    onSearchChange,
    results,
    onResultPick,
  }: {
    selected: AgencyOption | null;
    onSelect: (a: AgencyOption) => void;
    onClear: () => void;
    searchModeState: 'id' | 'name';
    onSearchModeChange: (m: 'id' | 'name') => void;
    agencyIdVal: string;
    onAgencyIdChange: (v: string) => void;
    onLookup: () => void;
    searchVal: string;
    onSearchChange: (v: string) => void;
    results: AgencyOption[];
    onResultPick: (a: AgencyOption) => void;
  }) {
    if (selected) {
      return (
        <div className="flex items-center justify-between rounded-md border px-3 py-2 bg-muted/30">
          <div>
            <p className="font-medium text-sm">{selected.display_name}</p>
            <p className="text-xs text-muted-foreground">
              {selected.agency_id && `#${selected.agency_id} · `}
              {selected.city}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClear}>
            Change
          </Button>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <div className="flex gap-2">
          <Button
            type="button"
            variant={searchModeState === 'id' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onSearchModeChange('id')}
          >
            By Agency ID
          </Button>
          <Button
            type="button"
            variant={searchModeState === 'name' ? 'default' : 'outline'}
            size="sm"
            onClick={() => onSearchModeChange('name')}
          >
            Search by Name
          </Button>
        </div>
        {searchModeState === 'id' && (
          <div className="flex gap-2">
            <Input
              placeholder="Agency ID (e.g. 30748)"
              value={agencyIdVal}
              onChange={(e) => onAgencyIdChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onLookup()}
            />
            <Button type="button" variant="outline" onClick={onLookup}>
              Look Up
            </Button>
          </div>
        )}
        {searchModeState === 'name' && (
          <div className="relative">
            <Input
              placeholder="Search agency name..."
              value={searchVal}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            {results.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-md border bg-background shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                {results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
                    onClick={() => onResultPick(r)}
                  >
                    <span className="font-medium">{r.display_name}</span>
                    {r.agency_id && (
                      <span className="ml-1.5 text-muted-foreground text-xs">
                        #{r.agency_id}
                      </span>
                    )}
                    {r.city && (
                      <span className="ml-1.5 text-muted-foreground text-xs">
                        {r.city}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-8">
            <DialogTitle>
              {isEdit ? 'Edit Tasting' : 'New Tasting'}
            </DialogTitle>
            {!isEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsBulk((b) => !b)}
                className="text-xs"
              >
                {isBulk ? 'Single entry' : 'Bulk add'}
              </Button>
            )}
          </div>
        </DialogHeader>

        {/* ====== SINGLE FORM ====== */}
        {!isBulk && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Agency</Label>
              <AgencyPicker
                selected={selectedAgency}
                onSelect={(a) => { setSelectedAgency(a); setCity(a.city ?? ''); }}
                onClear={() => { setSelectedAgency(null); setAgencyIdInput(''); setAgencySearch(''); setAgencyResults([]); }}
                searchModeState={searchMode}
                onSearchModeChange={setSearchMode}
                agencyIdVal={agencyIdInput}
                onAgencyIdChange={setAgencyIdInput}
                onLookup={lookupAgencyById}
                searchVal={agencySearch}
                onSearchChange={setAgencySearch}
                results={agencyResults}
                onResultPick={(a) => { setSelectedAgency(a); setCity(a.city ?? ''); setAgencyResults([]); setAgencySearch(''); }}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Start Time</Label>
                <Input type="time" value={startTime} onChange={(e) => handleStartTimeChange(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>End Time</Label>
                <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1">
              <Label>City <span className="text-muted-foreground text-xs">(auto-filled from agency)</span></Label>
              <Input
                placeholder="Auto-filled from agency"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Staff Category</Label>
                <Select value={staffCategory} onValueChange={setStaffCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="None assigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    <SelectItem value="DBC">DBC</SelectItem>
                    <SelectItem value="HB Internal Staff">HB Internal Staff</SelectItem>
                    <SelectItem value="HB Sales Team">HB Sales Team</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Staff Person <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  placeholder="e.g. Kerry, Samantha…"
                  value={staffPerson}
                  onChange={(e) => setStaffPerson(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Auto-status:</span>
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2 py-0.5 font-medium',
                  statusConfig(derivedStatus).className
                )}
              >
                {statusConfig(derivedStatus).label}
              </span>
            </div>

            <div className="space-y-1">
              <Label>Notes <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea
                placeholder="Any additional notes…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        )}

        {/* ====== BULK FORM ====== */}
        {isBulk && !isEdit && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Add multiple tastings at once. Shared staff/notes fields apply to all rows.
            </p>

            {/* Shared fields */}
            <div className="grid grid-cols-2 gap-3 rounded-lg border p-3 bg-muted/20">
              <div className="space-y-1">
                <Label>Staff Category (all)</Label>
                <Select value={bulkStaffCategory} onValueChange={setBulkStaffCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    <SelectItem value="DBC">DBC</SelectItem>
                    <SelectItem value="HB Internal Staff">HB Internal Staff</SelectItem>
                    <SelectItem value="HB Sales Team">HB Sales Team</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Staff Person (all)</Label>
                <Input
                  placeholder="optional"
                  value={bulkStaffPerson}
                  onChange={(e) => setBulkStaffPerson(e.target.value)}
                />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Notes (all)</Label>
                <Input
                  placeholder="optional"
                  value={bulkNotes}
                  onChange={(e) => setBulkNotes(e.target.value)}
                />
              </div>
            </div>

            {/* Row list */}
            <div className="space-y-3">
              {bulkRows.map((row, idx) => (
                <div key={idx} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      Tasting {idx + 1}
                    </span>
                    {bulkRows.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => setBulkRows((r) => r.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  {/* Agency for this row */}
                  {row.selectedAgency ? (
                    <div className="flex items-center justify-between rounded border px-2 py-1.5 text-sm bg-muted/30">
                      <span className="font-medium">{row.selectedAgency.display_name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => updateBulkRow(idx, { selectedAgency: null, agencyIdInput: '' })}
                      >
                        Change
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        placeholder="Agency ID"
                        value={row.agencyIdInput}
                        onChange={(e) => updateBulkRow(idx, { agencyIdInput: e.target.value })}
                        onKeyDown={(e) => e.key === 'Enter' && lookupBulkAgencyById(idx)}
                        className="flex-1"
                      />
                      <Button type="button" variant="outline" size="sm" onClick={() => lookupBulkAgencyById(idx)}>
                        Look Up
                      </Button>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Date</Label>
                      <Input
                        type="date"
                        value={row.date}
                        onChange={(e) => updateBulkRow(idx, { date: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Start</Label>
                      <Input
                        type="time"
                        value={row.startTime}
                        onChange={(e) => {
                          const st = e.target.value;
                          updateBulkRow(idx, { startTime: st, endTime: st ? addHours(st, 2) : '' });
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">End</Label>
                      <Input
                        type="time"
                        value={row.endTime}
                        onChange={(e) => updateBulkRow(idx, { endTime: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setBulkRows((r) => [...r, emptyRow()])}
            >
              <Plus className="mr-1 h-4 w-4" /> Add Another
            </Button>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={isBulk ? handleSaveBulk : handleSave} disabled={saving}>
            {saving
              ? 'Saving…'
              : isBulk
              ? `Create ${bulkRows.filter((r) => r.selectedAgency && r.date).length || ''} Tastings`
              : isEdit
              ? 'Update Tasting'
              : 'Create Tasting'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
