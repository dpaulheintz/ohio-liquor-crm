import type { loadLines } from '@/lib/bottle-sales-server';
import type { EntryFormData } from './entry-form';

/** Usage counts (for "most used on top") and the latest entry per location + type (for "Repeat last"). */
export function buildFormData(
  products: EntryFormData['products'],
  locations: EntryFormData['locations'],
  lines: Awaited<ReturnType<typeof loadLines>>,
): EntryFormData {
  const usage: Record<string, number> = {};
  const latest: Record<string, { entry: string; date: string; at: string }> = {};
  for (const l of lines) {
    const k = `${l.location_code}|${l.type}`;
    usage[`${k}|${l.sku}`] = (usage[`${k}|${l.sku}`] ?? 0) + 1;
    usage[`*|${l.sku}`] = (usage[`*|${l.sku}`] ?? 0) + 1;
    const cur = latest[k];
    if (!cur || l.sale_date > cur.date || (l.sale_date === cur.date && l.created_at > cur.at)) latest[k] = { entry: l.entry_id, date: l.sale_date, at: l.created_at };
  }
  const lastByKey: EntryFormData['lastByKey'] = {};
  for (const [k, v] of Object.entries(latest)) {
    const qty: Record<string, number> = {};
    for (const l of lines) if (l.entry_id === v.entry) qty[l.sku] = (qty[l.sku] ?? 0) + l.bottles;
    lastByKey[k] = { date: v.date, qty };
  }
  return { products, locations, usage, lastByKey };
}
