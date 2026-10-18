'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { saveSettings, type SettingsInput } from '@/app/actions/wholesale-forms';
import type { WholesaleSettings } from '@/lib/wholesale-forms';

const FIELDS: { key: keyof SettingsInput; label: string; hint?: string }[] = [
  { key: 'warehouse_label', label: 'Warehouse label', hint: 'Printed in the title: **GRANDVIEW**' },
  { key: 'agency_number', label: 'Agency #' },
  { key: 'a3a_name', label: 'A-3a name' },
  { key: 'a3a_address', label: 'A-3a address', hint: 'Street, then city — split onto two lines at the first comma' },
  { key: 'a3a_phone', label: 'A-3a telephone number' },
  { key: 'a3a_email', label: 'A-3a email address' },
];

export function SettingsClient({ settings }: { settings: WholesaleSettings }) {
  const router = useRouter();
  const [form, setForm] = useState<SettingsInput>(settings);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setSaving(true);
    const res = await saveSettings(form);
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success('Settings saved — used for new forms');
    router.refresh();
  }

  return (
    <div className="max-w-xl space-y-5">
      <p className="text-sm text-muted-foreground">
        Printed on every new form. Saved forms keep the details they were created with.
      </p>
      <div className="rounded-xl border bg-card p-5 space-y-4">
        {FIELDS.map((f) => (
          <div key={f.key} className="space-y-1.5">
            <Label htmlFor={`s-${f.key}`}>{f.label}</Label>
            <Input id={`s-${f.key}`} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
          </div>
        ))}
        <div className="flex justify-end">
          <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Save settings</Button>
        </div>
      </div>
    </div>
  );
}
