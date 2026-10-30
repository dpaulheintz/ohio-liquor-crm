'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { saveEmailRecipients, saveWarehouse, type WarehouseInput } from '@/app/actions/wholesale-forms';
import type { WholesaleWarehouse } from '@/lib/wholesale-forms';

const FIELDS: { key: keyof WarehouseInput; label: string; hint?: string }[] = [
  { key: 'label', label: 'Warehouse tag', hint: 'Printed under the vendor line: **GRANDVIEW**' },
  { key: 'agency_number', label: 'Agency #' },
  { key: 'a3a_name', label: 'A-3a name' },
  { key: 'a3a_address', label: 'A-3a address', hint: 'Street, then city — split onto two lines at the first comma' },
  { key: 'a3a_phone', label: 'A-3a telephone number' },
  { key: 'a3a_email', label: 'A-3a email address' },
];

export function SettingsClient({ warehouses, recipients }: { warehouses: WholesaleWarehouse[]; recipients: string[] }) {
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="font-serif text-lg font-semibold">Warehouses</h2>
          <p className="text-sm text-muted-foreground">
            The A-3a box on each form comes from the warehouse picked on that form. Saved forms keep the details they were created with.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {warehouses.map((w) => <WarehouseCard key={w.id} warehouse={w} />)}
        </div>
      </section>
      <RecipientsCard recipients={recipients} />
    </div>
  );
}

function WarehouseCard({ warehouse }: { warehouse: WholesaleWarehouse }) {
  const router = useRouter();
  const [form, setForm] = useState<WarehouseInput>({
    label: warehouse.label, agency_number: warehouse.agency_number, a3a_name: warehouse.a3a_name,
    a3a_address: warehouse.a3a_address, a3a_phone: warehouse.a3a_phone, a3a_email: warehouse.a3a_email,
  });
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    const res = await saveWarehouse(warehouse.id, form);
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(`${warehouse.name} saved — used for new forms`);
    router.refresh();
  }

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{warehouse.name}</h3>
        {warehouse.is_default && <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">Default</span>}
      </div>
      {FIELDS.map((f) => (
        <div key={f.key} className="space-y-1.5">
          <Label htmlFor={`w-${warehouse.id}-${f.key}`}>{f.label}</Label>
          <Input id={`w-${warehouse.id}-${f.key}`} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
          {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
        </div>
      ))}
      <div className="flex justify-end">
        <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Save {warehouse.name}</Button>
      </div>
    </div>
  );
}

function RecipientsCard({ recipients }: { recipients: string[] }) {
  const router = useRouter();
  const [text, setText] = useState(recipients.join('\n'));
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    const res = await saveEmailRecipients(text.split(/[\n,;]+/));
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success('Recipients saved');
    router.refresh();
  }

  return (
    <section className="max-w-xl space-y-3">
      <div>
        <h2 className="font-serif text-lg font-semibold">Send recipients</h2>
        <p className="text-sm text-muted-foreground">Finalized wholesale forms and retail requisitions are emailed (PDF attached) to these addresses when someone taps Send.</p>
      </div>
      <div className="rounded-xl border bg-card p-5 space-y-3">
        <Label htmlFor="recipients">One email per line</Label>
        <Textarea id="recipients" value={text} onChange={(e) => setText(e.target.value)} rows={3} className="font-mono text-sm" />
        <div className="flex justify-end">
          <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Save recipients</Button>
        </div>
      </div>
    </section>
  );
}
