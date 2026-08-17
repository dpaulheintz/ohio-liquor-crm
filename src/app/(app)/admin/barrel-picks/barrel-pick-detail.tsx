'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  PIPELINE_STAGES,
  BARREL_TYPES,
  BARREL_DEFAULTS,
  type BarrelPick,
  type PipelineStage,
  type BarrelType,
  type ChecklistItem,
} from '@/app/actions/barrel-pick-constants';
import {
  getBarrelPick,
  updateBarrelPick,
  updateChecklistItem,
  addBarrelPickNote,
} from '@/app/actions/barrel-picks';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { format, parseISO, formatDistanceToNow } from 'date-fns';
import {
  Check,
  Clock,
  Circle,
  ChevronDown,
  ChevronRight,
  Send,
  Pencil,
  Save,
  X,
  User,
  Mail,
  Phone,
  Calendar,
  Wine,
} from 'lucide-react';

type Rep = { id: string; full_name: string | null; email: string };

const STAGE_LABELS: Record<PipelineStage, string> = {
  prospect: 'Prospect', scheduled: 'Scheduled', picked: 'Picked',
  in_production: 'In Production', ready_for_delivery: 'Ready for Delivery',
  delivered: 'Delivered', completed: 'Completed', cancelled: 'Cancelled',
};

const STAGE_BADGE_CLASS: Record<PipelineStage, string> = {
  prospect: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  picked: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  in_production: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  ready_for_delivery: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  delivered: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

interface Props {
  pickId: string | null;
  open: boolean;
  onClose: () => void;
  reps: Rep[];
  onRefresh: () => void;
}

export function BarrelPickDetail({ pickId, open, onClose, reps, onRefresh }: Props) {
  const [pick, setPick] = useState<BarrelPick | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [sendingNote, setSendingNote] = useState(false);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  const fetchPick = useCallback(async () => {
    if (!pickId) return;
    setLoading(true);
    try {
      const data = await getBarrelPick(pickId);
      setPick(data);
    } finally {
      setLoading(false);
    }
  }, [pickId]);

  useEffect(() => {
    if (open && pickId) {
      fetchPick();
      setEditing(false);
      setNewNote('');
      setExpandedStep(null);
    }
  }, [open, pickId, fetchPick]);

  if (!open) return null;

  async function handleStatusChange(status: PipelineStage) {
    if (!pick) return;
    try {
      await updateBarrelPick(pick.id, { status });
      toast.success(`Status updated to ${STAGE_LABELS[status]}`);
      fetchPick();
      onRefresh();
    } catch {
      toast.error('Failed to update status');
    }
  }

  async function handleAddNote() {
    if (!pick || !newNote.trim()) return;
    setSendingNote(true);
    try {
      await addBarrelPickNote(pick.id, newNote);
      setNewNote('');
      fetchPick();
    } catch {
      toast.error('Failed to add note');
    } finally {
      setSendingNote(false);
    }
  }

  async function handleChecklistToggle(item: ChecklistItem) {
    const next = item.status === 'completed' ? 'not_started'
      : item.status === 'not_started' ? 'in_progress'
      : 'completed';
    try {
      await updateChecklistItem(item.id, { status: next as 'not_started' | 'in_progress' | 'completed' });
      fetchPick();
    } catch {
      toast.error('Failed to update checklist');
    }
  }

  async function handleChecklistNotes(itemId: string, notes: string) {
    try {
      await updateChecklistItem(itemId, { notes: notes || null });
      fetchPick();
    } catch {
      toast.error('Failed to save notes');
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        {loading || !pick ? (
          <div className="flex items-center justify-center h-40">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        ) : (
          <>
            <SheetHeader className="space-y-3 pb-4 border-b">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <SheetTitle className="text-xl">{pick.customer_name}</SheetTitle>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <Badge variant="outline" className="text-xs">{pick.customer_type}</Badge>
                    <Badge className={cn('text-xs', STAGE_BADGE_CLASS[pick.status as PipelineStage])}>
                      {STAGE_LABELS[pick.status as PipelineStage]}
                    </Badge>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setEditing(!editing)}>
                  {editing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                </Button>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-xs">
                  <Wine className="h-3 w-3 mr-1" />
                  {pick.barrel_type}
                  {pick.is_half_barrel && ' (Half)'}
                </Badge>
                <span className="text-lg font-bold text-amber-600 dark:text-amber-400">
                  ${Number(pick.total_value).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>

              <div className="w-full">
                <Label className="text-xs text-muted-foreground">Change Status</Label>
                <Select value={pick.status} onValueChange={v => handleStatusChange(v as PipelineStage)}>
                  <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PIPELINE_STAGES.map(s => (
                      <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </SheetHeader>

            {editing ? (
              <EditForm pick={pick} reps={reps} onSave={() => { setEditing(false); fetchPick(); onRefresh(); }} onCancel={() => setEditing(false)} />
            ) : (
              <div className="space-y-6 pt-4">
                {/* Info */}
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">Details</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {pick.contact_name && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <User className="h-3.5 w-3.5 shrink-0" /> {pick.contact_name}
                      </div>
                    )}
                    {pick.contact_email && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="h-3.5 w-3.5 shrink-0" /> {pick.contact_email}
                      </div>
                    )}
                    {pick.contact_phone && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-3.5 w-3.5 shrink-0" /> {pick.contact_phone}
                      </div>
                    )}
                    {pick.rep?.full_name && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <User className="h-3.5 w-3.5 shrink-0" /> Rep: {pick.rep.full_name}
                      </div>
                    )}
                    {pick.pick_date && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5 shrink-0" /> Pick: {format(parseISO(pick.pick_date), 'MMM d, yyyy')}
                      </div>
                    )}
                    {pick.bottling_date && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5 shrink-0" /> Bottling: {format(parseISO(pick.bottling_date), 'MMM d, yyyy')}
                      </div>
                    )}
                    {pick.delivery_date && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-3.5 w-3.5 shrink-0" /> Delivery: {format(parseISO(pick.delivery_date), 'MMM d, yyyy')}
                      </div>
                    )}
                    {pick.barrel_selected && (
                      <div className="col-span-2 text-muted-foreground">
                        Barrel: {pick.barrel_selected}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center rounded-lg border p-2 mt-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Price/Bottle</p>
                      <p className="font-semibold text-sm">${Number(pick.price_per_bottle).toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">
                        {pick.actual_yield ? 'Actual' : 'Expected'} Yield
                      </p>
                      <p className="font-semibold text-sm">
                        {pick.actual_yield ?? pick.expected_yield}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Total Value</p>
                      <p className="font-semibold text-sm text-amber-600 dark:text-amber-400">
                        ${Number(pick.total_value).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                  </div>
                </section>

                {/* Checklist */}
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold">Checklist</h3>
                  {pick.checklist && (
                    <>
                      <div className="flex items-center gap-2">
                        <Progress
                          value={(pick.checklist.filter(c => c.status === 'completed').length / pick.checklist.length) * 100}
                          className="h-2 flex-1"
                        />
                        <span className="text-xs text-muted-foreground">
                          {pick.checklist.filter(c => c.status === 'completed').length}/{pick.checklist.length}
                        </span>
                      </div>
                      <div className="space-y-1">
                        {pick.checklist.map(item => (
                          <ChecklistRow
                            key={item.id}
                            item={item}
                            expanded={expandedStep === item.id}
                            onToggleExpand={() => setExpandedStep(expandedStep === item.id ? null : item.id)}
                            onToggleStatus={() => handleChecklistToggle(item)}
                            onSaveNotes={(notes) => handleChecklistNotes(item.id, notes)}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </section>

                {/* Notes */}
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold">Notes</h3>
                  <div className="flex gap-2">
                    <Textarea
                      value={newNote}
                      onChange={e => setNewNote(e.target.value)}
                      placeholder="Add a note..."
                      rows={2}
                      className="flex-1 text-sm"
                    />
                    <Button
                      size="icon"
                      onClick={handleAddNote}
                      disabled={!newNote.trim() || sendingNote}
                      className="self-end"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                  {pick.notes && pick.notes.length > 0 ? (
                    <div className="space-y-3">
                      {pick.notes.map(note => (
                        <div key={note.id} className="rounded-lg border p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium">
                              {note.author?.full_name ?? 'Unknown'}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {formatDistanceToNow(parseISO(note.created_at), { addSuffix: true })}
                            </span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No notes yet</p>
                  )}
                </section>
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ChecklistRow({
  item,
  expanded,
  onToggleExpand,
  onToggleStatus,
  onSaveNotes,
}: {
  item: ChecklistItem;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleStatus: () => void;
  onSaveNotes: (notes: string) => void;
}) {
  const [notesDraft, setNotesDraft] = useState(item.notes ?? '');
  const [editingNotes, setEditingNotes] = useState(false);

  const StatusIcon = item.status === 'completed' ? Check
    : item.status === 'in_progress' ? Clock
    : Circle;

  const statusColor = item.status === 'completed'
    ? 'text-green-600 dark:text-green-400'
    : item.status === 'in_progress'
    ? 'text-amber-500 dark:text-amber-400'
    : 'text-muted-foreground/40';

  return (
    <div className="rounded-lg border">
      <div className="flex items-center gap-2 p-2">
        <button
          onClick={onToggleStatus}
          className={cn('shrink-0 p-0.5 rounded transition-colors hover:bg-muted', statusColor)}
        >
          <StatusIcon className="h-4 w-4" />
        </button>
        <button
          onClick={onToggleExpand}
          className={cn(
            'flex-1 text-left text-sm',
            item.status === 'completed' && 'line-through text-muted-foreground'
          )}
        >
          {item.step}
        </button>
        <button onClick={onToggleExpand} className="shrink-0 text-muted-foreground">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
      </div>

      {expanded && (
        <div className="border-t px-3 py-2 space-y-2 bg-muted/30">
          {item.completed_at && (
            <p className="text-[10px] text-muted-foreground">
              Completed {format(parseISO(item.completed_at), 'MMM d, yyyy')}
              {item.completer?.full_name && ` by ${item.completer.full_name}`}
            </p>
          )}

          {editingNotes ? (
            <div className="flex gap-1">
              <Input
                value={notesDraft}
                onChange={e => setNotesDraft(e.target.value)}
                placeholder="Notes..."
                className="h-7 text-xs flex-1"
              />
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => { onSaveNotes(notesDraft); setEditingNotes(false); }}
              >
                <Save className="h-3 w-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => { setNotesDraft(item.notes ?? ''); setEditingNotes(false); }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ) : (
            <button
              onClick={() => setEditingNotes(true)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {item.notes || 'Add notes...'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function EditForm({
  pick,
  reps,
  onSave,
  onCancel,
}: {
  pick: BarrelPick;
  reps: Rep[];
  onSave: () => void;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [customerName, setCustomerName] = useState(pick.customer_name);
  const [contactName, setContactName] = useState(pick.contact_name ?? '');
  const [contactEmail, setContactEmail] = useState(pick.contact_email ?? '');
  const [contactPhone, setContactPhone] = useState(pick.contact_phone ?? '');
  const [barrelType, setBarrelType] = useState<string>(pick.barrel_type);
  const [isHalf, setIsHalf] = useState(pick.is_half_barrel);
  const [price, setPrice] = useState(Number(pick.price_per_bottle));
  const [expectedYield, setExpectedYield] = useState(pick.expected_yield);
  const [actualYield, setActualYield] = useState(pick.actual_yield ?? '');
  const [pickDate, setPickDate] = useState(pick.pick_date ?? '');
  const [bottlingDate, setBottlingDate] = useState(pick.bottling_date ?? '');
  const [deliveryDate, setDeliveryDate] = useState(pick.delivery_date ?? '');
  const [barrelSelected, setBarrelSelected] = useState(pick.barrel_selected ?? '');
  const [repId, setRepId] = useState(pick.rep_id ?? '');

  const canHalf = BARREL_DEFAULTS[barrelType as BarrelType]?.halfYield !== null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateBarrelPick(pick.id, {
        customer_name: customerName.trim(),
        contact_name: contactName || null,
        contact_email: contactEmail || null,
        contact_phone: contactPhone || null,
        barrel_type: barrelType as BarrelType,
        is_half_barrel: canHalf ? isHalf : false,
        price_per_bottle: price,
        expected_yield: expectedYield,
        actual_yield: actualYield !== '' ? Number(actualYield) : null,
        pick_date: pickDate || null,
        bottling_date: bottlingDate || null,
        delivery_date: deliveryDate || null,
        barrel_selected: barrelSelected || null,
        rep_id: repId || null,
      });
      toast.success('Updated');
      onSave();
    } catch {
      toast.error('Failed to update');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-4 pt-4">
      <div className="space-y-2">
        <Label className="text-xs">Customer Name</Label>
        <Input value={customerName} onChange={e => setCustomerName(e.target.value)} required />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Contact Name</Label>
          <Input value={contactName} onChange={e => setContactName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Contact Email</Label>
          <Input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Contact Phone</Label>
        <Input value={contactPhone} onChange={e => setContactPhone(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Barrel Type</Label>
          <Select value={barrelType} onValueChange={setBarrelType}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {BARREL_TYPES.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Rep</Label>
          <Select value={repId} onValueChange={setRepId}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              {reps.map(r => <SelectItem key={r.id} value={r.id}>{r.full_name ?? r.email}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {canHalf && (
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isHalf} onChange={e => setIsHalf(e.target.checked)} className="rounded border-gray-300" />
          <span className="text-sm">Half Barrel</span>
        </label>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Price/Bottle</Label>
          <Input type="number" step="0.01" min="0" value={price} onChange={e => setPrice(Number(e.target.value))} className="h-8 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Expected Yield</Label>
          <Input type="number" min="1" value={expectedYield} onChange={e => setExpectedYield(Number(e.target.value))} className="h-8 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Actual Yield</Label>
          <Input type="number" min="0" value={actualYield} onChange={e => setActualYield(e.target.value === '' ? '' : Number(e.target.value))} className="h-8 text-xs" placeholder="—" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Pick Date</Label>
          <Input type="date" value={pickDate} onChange={e => setPickDate(e.target.value)} className="h-8 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Bottling Date</Label>
          <Input type="date" value={bottlingDate} onChange={e => setBottlingDate(e.target.value)} className="h-8 text-xs" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Delivery Date</Label>
          <Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className="h-8 text-xs" />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Barrel Selected</Label>
        <Input value={barrelSelected} onChange={e => setBarrelSelected(e.target.value)} placeholder="Which barrel they chose" />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
}
