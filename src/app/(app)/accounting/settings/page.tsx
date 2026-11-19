import { getFinData } from '@/lib/fin/page-data';
import { requireAccounting } from '@/lib/fin/server';
import { DEFAULT_CROSS_CHECKS, type CrossCheckSettings } from '@/lib/fin/shared';
import { SettingsClient } from '@/components/accounting/settings-client';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const d = await getFinData();
  const { supabase } = await requireAccounting();
  const [{ data: cc }, { data: locs }, { data: log }] = await Promise.all([
    supabase.from('fin_settings').select('value').eq('key', 'cross_checks').maybeSingle(),
    supabase.from('locations').select('id, name').order('name'),
    supabase.from('fin_audit_log').select('id, at, action, period, detail, by:profiles!fin_audit_log_user_id_fkey(full_name, email)').order('at', { ascending: false }).limit(60),
  ]);
  const crossChecks: CrossCheckSettings = { ...DEFAULT_CROSS_CHECKS, ...((cc?.value as Partial<CrossCheckSettings>) ?? {}) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const audit = (log ?? []).map(({ by, ...r }: any) => ({ ...r, who: by ? by.full_name || by.email : null })) as { id: number; at: string; action: string; period: string | null; detail: Record<string, unknown>; who: string | null }[];
  const lastUpload = Object.fromEntries(d.uploads.filter((u) => u.status === 'current').map((u) => [u.period, `v${u.version}`]));

  return (
    <SettingsClient
      thresholds={d.thresholds}
      entities={d.entities}
      accounts={d.accounts}
      aliases={d.aliases}
      periods={d.periods.map((p) => ({ ...p, version: lastUpload[p.period] ?? null }))}
      crossChecks={crossChecks}
      locations={(locs ?? []) as { id: string; name: string }[]}
      audit={audit}
    />
  );
}
