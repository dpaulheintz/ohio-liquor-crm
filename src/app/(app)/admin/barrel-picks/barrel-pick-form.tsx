'use client';

import { useState } from 'react';
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
import {
  BARREL_TYPES,
  CUSTOMER_TYPES,
  BARREL_DEFAULTS,
  type BarrelType,
  type CustomerType,
} from '@/app/actions/barrel-pick-constants';
import { createBarrelPick } from '@/app/actions/barrel-picks';

type Rep = { id: string; full_name: string | null; email: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reps: Rep[];
  onSuccess: () => void;
}

export function BarrelPickFormDialog({ open, onOpenChange, reps, onSuccess }: Props) {
  const [saving, setSaving] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerType, setCustomerType] = useState<CustomerType>('Corporation');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [barrelType, setBarrelType] = useState<BarrelType>('Double Oaked');
  const [isHalf, setIsHalf] = useState(false);
  const [price, setPrice] = useState(BARREL_DEFAULTS['Double Oaked'].price);
  const [yield_, setYield] = useState(BARREL_DEFAULTS['Double Oaked'].fullYield);
  const [pickDate, setPickDate] = useState('');
  const [repId, setRepId] = useState('');
  const [notes, setNotes] = useState('');

  function handleBarrelChange(bt: BarrelType) {
    setBarrelType(bt);
    const d = BARREL_DEFAULTS[bt];
    setPrice(d.price);
    if (isHalf && d.halfYield) {
      setYield(d.halfYield);
    } else {
      setYield(d.fullYield);
      if (!d.halfYield) setIsHalf(false);
    }
  }

  function handleHalfToggle(val: boolean) {
    setIsHalf(val);
    const d = BARREL_DEFAULTS[barrelType];
    setYield(val && d.halfYield ? d.halfYield : d.fullYield);
  }

  const canHalf = BARREL_DEFAULTS[barrelType].halfYield !== null;
  const totalValue = yield_ * price;

  function reset() {
    setCustomerName('');
    setCustomerType('Corporation');
    setContactName('');
    setContactEmail('');
    setContactPhone('');
    setBarrelType('Double Oaked');
    setIsHalf(false);
    setPrice(BARREL_DEFAULTS['Double Oaked'].price);
    setYield(BARREL_DEFAULTS['Double Oaked'].fullYield);
    setPickDate('');
    setRepId('');
    setNotes('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerName.trim()) return;
    setSaving(true);
    try {
      await createBarrelPick({
        customer_name: customerName.trim(),
        customer_type: customerType,
        contact_name: contactName || undefined,
        contact_email: contactEmail || undefined,
        contact_phone: contactPhone || undefined,
        barrel_type: barrelType,
        is_half_barrel: canHalf ? isHalf : false,
        price_per_bottle: price,
        expected_yield: yield_,
        pick_date: pickDate || undefined,
        rep_id: repId || undefined,
        initial_notes: notes || undefined,
      });
      toast.success('Barrel pick created');
      reset();
      onSuccess();
    } catch {
      toast.error('Failed to create barrel pick');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Barrel Pick</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bp-customer">Customer Name *</Label>
            <Input id="bp-customer" value={customerName} onChange={e => setCustomerName(e.target.value)} required />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Customer Type</Label>
              <Select value={customerType} onValueChange={v => setCustomerType(v as CustomerType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CUSTOMER_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Barrel Type</Label>
              <Select value={barrelType} onValueChange={v => handleBarrelChange(v as BarrelType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BARREL_TYPES.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {canHalf && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isHalf}
                onChange={e => handleHalfToggle(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm">Half Barrel</span>
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="bp-price">Price / Bottle ($)</Label>
              <Input
                id="bp-price"
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={e => setPrice(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bp-yield">Expected Yield</Label>
              <Input
                id="bp-yield"
                type="number"
                min="1"
                value={yield_}
                onChange={e => setYield(Number(e.target.value))}
              />
            </div>
          </div>

          <div className="rounded-lg bg-muted/50 border p-3 text-center">
            <p className="text-xs text-muted-foreground">Estimated Total Value</p>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              ${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </div>

          <div className="space-y-3 border-t pt-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Contact Info (optional)</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="bp-cname" className="text-xs">Name</Label>
                <Input id="bp-cname" value={contactName} onChange={e => setContactName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bp-cemail" className="text-xs">Email</Label>
                <Input id="bp-cemail" type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bp-cphone" className="text-xs">Phone</Label>
                <Input id="bp-cphone" value={contactPhone} onChange={e => setContactPhone(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="bp-date">Pick Date</Label>
              <Input id="bp-date" type="date" value={pickDate} onChange={e => setPickDate(e.target.value)} />
              <p className="text-[10px] text-muted-foreground">Leave blank for prospect</p>
            </div>
            <div className="space-y-2">
              <Label>Assign Rep</Label>
              <Select value={repId} onValueChange={setRepId}>
                <SelectTrigger><SelectValue placeholder="Select rep..." /></SelectTrigger>
                <SelectContent>
                  {reps.map(r => <SelectItem key={r.id} value={r.id}>{r.full_name ?? r.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bp-notes">Initial Notes</Label>
            <Textarea id="bp-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
            <Button type="submit" disabled={saving || !customerName.trim()}>
              {saving ? 'Creating...' : 'Create Barrel Pick'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
