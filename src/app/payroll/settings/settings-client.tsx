'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { saveSettings, type SettingsInput } from '@/app/actions/payroll';
import type { PayrollSettings } from '@/lib/payroll/types';
import { centsPlain, hoursPlain } from '@/lib/payroll/units';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function SettingsClient({ settings }: { settings: PayrollSettings }) {
  const router = useRouter();
  const [f, setF] = useState<SettingsInput>({
    pay_frequency: settings.pay_frequency,
    workweek_start_dow: settings.workweek_start_dow,
    next_period_start: settings.next_period_start ?? '',
    min_wage: centsPlain(settings.min_wage_cents),
    tipped_cash_wage: centsPlain(settings.tipped_cash_wage_cents),
    ot_threshold_hours: hoursPlain(settings.ot_threshold_hh),
    alert_weekly_hours: hoursPlain(settings.alert_weekly_hours_hh),
    alert_tips: centsPlain(settings.alert_tips_cents),
    big_change_pct: settings.big_change_pct,
    big_change_min: centsPlain(settings.big_change_min_cents),
  });
  const [saving, setSaving] = useState(false);
  const field = (label: string, key: keyof SettingsInput, hint?: string, type = 'text') => (
    <div className="space-y-1.5">
      <Label htmlFor={`s-${key}`}>{label}</Label>
      <Input id={`s-${key}`} type={type} value={String(f[key] ?? '')} onChange={(e) => setF({ ...f, [key]: key === 'big_change_pct' ? Number(e.target.value) : e.target.value })} inputMode={type === 'text' ? 'decimal' : undefined} />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );

  async function save() {
    setSaving(true);
    const res = await saveSettings(f);
    setSaving(false);
    if (!res.ok) return toast.error(res.error);
    toast.success('Settings saved — change logged');
    router.refresh();
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="rounded-xl border bg-card p-5 grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label>Pay frequency</Label>
          <select value={f.pay_frequency} onChange={(e) => setF({ ...f, pay_frequency: e.target.value as SettingsInput['pay_frequency'] })} className="h-10 w-full rounded-md border bg-white px-2 text-sm">
            <option value="biweekly">Bi-weekly</option><option value="weekly">Weekly</option><option value="semimonthly">Semi-monthly</option>
          </select>
        </div>
        <div className="space-y-1.5"><Label>Workweek starts</Label>
          <select value={f.workweek_start_dow} onChange={(e) => setF({ ...f, workweek_start_dow: Number(e.target.value) })} className="h-10 w-full rounded-md border bg-white px-2 text-sm">
            {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
          <p className="text-[11px] text-muted-foreground">Overtime and tip credit are checked per workweek.</p>
        </div>
        {field('Next pay period start', 'next_period_start', 'Prefills new runs.', 'date')}
        {field('OT threshold (hours / week)', 'ot_threshold_hours')}
        {field('Ohio minimum wage ($/hr)', 'min_wage', 'Update every January 1.')}
        {field('Tipped cash wage ($/hr)', 'tipped_cash_wage', 'Update every January 1.')}
        {field('Alert above (hours / week)', 'alert_weekly_hours')}
        {field('Alert above (tips per period, $)', 'alert_tips')}
        {field('Big change vs last run (%)', 'big_change_pct')}
        {field('…and at least ($)', 'big_change_min')}
      </div>
      <div className="flex justify-end"><Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Save settings</Button></div>
    </div>
  );
}
