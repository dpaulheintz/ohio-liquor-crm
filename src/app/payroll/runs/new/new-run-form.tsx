'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { createRun } from '@/app/actions/payroll';

export function NewRunForm({ defaultStart, defaultEnd, frequency }: { defaultStart: string; defaultEnd: string; frequency: string }) {
  const router = useRouter();
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    const res = await createRun({ periodStart: start, periodEnd: end, notes });
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    router.push(`/payroll/runs/${res.data.id}`);
  }

  return (
    <div className="max-w-lg rounded-xl border bg-card p-5 space-y-4">
      <div>
        <h2 className="font-serif text-lg font-semibold">New payroll run</h2>
        <p className="text-sm text-muted-foreground">Dates are prefilled from Settings ({frequency}). Adjust if needed.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label htmlFor="ps">Pay period start</Label><Input id="ps" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="pe">Pay period end</Label><Input id="pe" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></div>
      </div>
      <div className="space-y-1.5"><Label htmlFor="notes">Notes</Label><Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <div className="flex justify-end">
        <Button onClick={submit} disabled={saving || !start || !end}>{saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Create run</Button>
      </div>
    </div>
  );
}
