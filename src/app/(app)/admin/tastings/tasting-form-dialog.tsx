'use client';

import { useState, useEffect, useRef } from 'react';
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
import type { Tasting, TastingStatus } from '@/lib/types';
import { addHours, deriveStatus, statusConfig } from './tasting-utils';
import { Plus, Trash2 } from 'lucide-react';

type AgencyOption = {
  id: string;
  display_name: string;
  city: string | null;
  agency_id: string | null;
};

interface BulkRow {
  agencySearch: string;
  agencyResults: AgencyOption[];
  selectedAgency: AgencyOption | null;
  date: string;
  startTime: string;
  endTime: string;
}

function emptyRow(): BulkRow {
  return {
    agencySearch: '',
    agencyResults: [],
    selectedAgency: null,
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
  const [agencySearch, setAgencySearch] = useState('');
  const [agencyResults, setAgencyResults] = useState<AgencyOption[]>([]);
  const [selectedAgency, setSelectedAgency] = useState<AgencyOption | null>(null);
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [city, setCity] = useState('');
  const [staffCategory, setStaffCategory] = useState('');
  const [staffPerson, setStaffPerson] = useState('');
  const [status, setStatus] = useState<TastingStatus>('needs_staff');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // --- Bulk-create state ---
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([emptyRow()]);
  const [bulkStaffCategory, setBulkStaffCategory] = useState('');
  const [bulkStaffPerson, setBulkStaffPerson] = useState('');
  const [bulkNotes, setBulkNotes] = useState('');

  // Per-row debounce timers for bulk search
  const bulkTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

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
      setStatus(tasting.status);
      setNotes(tasting.notes ?? '');
    } else {
      // Reset for create
      setSelectedAgency(
        defaultAgencyId && defaultAgencyName
          ? { id: defaultAgencyId, display_name: defaultAgencyName, city: defaultCity ?? null, agency_id: null }
          : null
      );
      setAgencySearch('');
      setAgencyResults([]);
      setDate('');
      setStartTime('');
      setEndTime('');
      setCity(defaultCity ?? '');
      setStaffCategory('');
      setStaffPerson('');
      setStatus('needs_staff');
      setNotes('');
      setBulkRows([emptyRow()]);
      setBulkStaffCategory('');
      setBulkStaffPerson('');
      setBulkNotes('');
      setIsBulk(false);
    }
  }, [open, tasting, defaultAgencyId, defaultAgencyName, defaultCity]);

  // Unified agency search — fires on any input, debounced 300ms
  useEffect(() => {
    if (agencySearch.length < 1) {
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
  }, [agencySearch]);

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

  function handleBulkAgencySearch(idx: number, query: string) {
    updateBulkRow(idx, { agencySearch: query, agencyResults: [] });
    if (bulkTimers.current[idx]) clearTimeout(bulkTimers.current[idx]);
    if (query.length < 1) return;
    bulkTimers.current[idx] = setTimeout(async () => {
      try {
        const res = await searchAccounts(query);
        updateBulkRow(idx, {
          agencyResults: res.filter((r) => r.type === 'agency') as AgencyOption[],
        });
      } catch { /* ignore */ }
    }, 300);
  }

  // --- Save single ---
  async function handleSave() {
    if (!selectedAgency) { toast.error('Select an agency'); return; }
    if (!date) { toast.error('Enter a date'); return; }
    if (!startTime || !endTime) { toast.error('Enter start and end time'); return; }

    setSaving(true);
    try {
      const resolvedCategory = staffCategory && staffCategory !== 'none' ? staffCategory : undefined;
      const payload = {
        agencyId: selectedAgency.id,
        date,
        startTime,
        endTime,
        city: city || selectedAgency.city || undefined,
        staffCategory: resolvedCategory,
        staffPerson: staffPerson || undefined,
        notes: notes || undefined,
        status,
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
            staffCategory: (bulkStaffCategory && bulkStaffCategory !== 'none') ? bulkStaffCategory : undefined,
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

  // Auto-sync status from staff fields on CREATE only.
  useEffect(() => {
    if (!isEdit) {
      setStatus(deriveStatus(staffCategory === 'none' ? '' : staffCategory, staffPerson));
    }
  }, [staffCategory, staffPerson, isEdit]);

  // ---- Unified agency picker sub-component ----
  function AgencyPicker({
    selected,
    onClear,
    searchVal,
    onSearchChange,
    results,
    onResultPick,
  }: {
    selected: AgencyOption | null;
    onClear: () => void;
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
      <div className="relative">
        <Input
          placeholder="Search by name, ID, or city…"
          value={searchVal}
          onChange={(e) => onSearchChange(e.target.value)}
          autoComplete="off"
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
                onClear={() => { setSelectedAgency(null); setAgencySearch(''); setAgencyResults([]); }}
                searchVal={agencySearch}
                onSearchChange={setAgencySearch}
                results={agencyResults}
                onResultPick={(a) => {
                  setSelectedAgency(a);
                  setCity(a.city ?? '');
                  setAgencyResults([]);
                  setAgencySearch('');
                }}
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
                    <SelectItem value="none">None</SelectItem>
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

            <div className="space-y-1">
              <Label>
                Status
                {!isEdit && (
                  <span className="ml-1.5 text-muted-foreground text-xs font-normal">
                    (auto-set from staff — override if needed)
                  </span>
                )}
              </Label>
              <Select value={status} onValueChange={(v) => setStatus(v as TastingStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="needs_staff">Needs Staff</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="staffed">Staffed</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
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
                    <SelectItem value="none">None</SelectItem>
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
                      <div>
                        <span className="font-medium">{row.selectedAgency.display_name}</span>
                        {row.selectedAgency.agency_id && (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            #{row.selectedAgency.agency_id}
                          </span>
                        )}
                        {row.selectedAgency.city && (
                          <span className="ml-1.5 text-xs text-muted-foreground">
                            {row.selectedAgency.city}
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => updateBulkRow(idx, { selectedAgency: null, agencySearch: '', agencyResults: [] })}
                      >
                        Change
                      </Button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Input
                        placeholder="Search by name, ID, or city…"
                        value={row.agencySearch}
                        onChange={(e) => handleBulkAgencySearch(idx, e.target.value)}
                        autoComplete="off"
                      />
                      {row.agencyResults.length > 0 && (
                        <div className="absolute top-full left-0 right-0 z-10 mt-1 rounded-md border bg-background shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                          {row.agencyResults.map((r) => (
                            <button
                              key={r.id}
                              type="button"
                              className="w-full px-3 py-2 text-left text-sm hover:bg-muted transition-colors"
                              onClick={() =>
                                updateBulkRow(idx, {
                                  selectedAgency: r,
                                  agencySearch: '',
                                  agencyResults: [],
                                })
                              }
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
