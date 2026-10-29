'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Loader2, Plus, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { reorderProducts, saveProduct } from '@/app/actions/wholesale-forms';
import { formatCents, parseDollarsToCents, type WholesaleProduct } from '@/lib/wholesale-forms';
import { cn } from '@/lib/utils';

interface Draft {
  brand_code: string;
  description: string;
  unit_type: string;
  price: string;
  active: boolean;
}

const toDraft = (p: WholesaleProduct): Draft => ({
  brand_code: p.brand_code,
  description: p.description,
  unit_type: p.unit_type,
  price: formatCents(p.price_cents).slice(1).replace(/,/g, ''),
  active: p.active,
});

export function PriceListClient({ products }: { products: WholesaleProduct[] }) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => Object.fromEntries(products.map((p) => [p.id, toDraft(p)])));
  const [adding, setAdding] = useState<Draft>({ brand_code: '', description: '', unit_type: 'Bottles', price: '', active: true });
  const [busy, setBusy] = useState<string | null>(null);

  function isDirty(p: WholesaleProduct) {
    const d = drafts[p.id];
    const o = toDraft(p);
    return d.brand_code !== o.brand_code || d.description !== o.description || d.unit_type !== o.unit_type || d.price !== o.price || d.active !== o.active;
  }

  async function save(id: string | null, d: Draft) {
    const cents = parseDollarsToCents(d.price);
    if (cents === null) return toast.error('Enter a price like 36.66');
    setBusy(id ?? 'new');
    const res = await saveProduct(id, { brand_code: d.brand_code, description: d.description, unit_type: d.unit_type, price_cents: cents, active: d.active });
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    toast.success(id ? 'Product updated — applies to new forms only' : 'Product added');
    if (!id) setAdding({ brand_code: '', description: '', unit_type: 'Bottles', price: '', active: true });
    router.refresh();
  }

  async function move(index: number, dir: -1 | 1) {
    const ids = products.map((p) => p.id);
    const j = index + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[index], ids[j]] = [ids[j], ids[index]];
    setBusy('order');
    const res = await reorderProducts(ids);
    setBusy(null);
    if (!res.ok) return toast.error(res.error);
    router.refresh();
  }

  const set = (id: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Price changes apply to new forms only — saved forms keep the prices they were created with. Deactivated products are hidden from new forms.
      </p>
      <div className="relative rounded-xl border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-2 py-2.5 w-16" />
              <th className="text-left font-medium px-2 py-2.5">Brand code</th>
              <th className="text-left font-medium px-2 py-2.5">Description</th>
              <th className="text-left font-medium px-2 py-2.5">Unit</th>
              <th className="text-left font-medium px-2 py-2.5">Price</th>
              <th className="text-left font-medium px-2 py-2.5">Active</th>
              <th className="px-2 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {products.map((p, i) => {
              const d = drafts[p.id] ?? toDraft(p);
              const dirty = isDirty(p);
              return (
                <tr key={p.id} className={cn(!p.active && 'opacity-60')}>
                  <td className="px-2 py-2">
                    <div className="flex">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => move(i, -1)} disabled={i === 0 || busy !== null} aria-label="Move up"><ArrowUp className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => move(i, 1)} disabled={i === products.length - 1 || busy !== null} aria-label="Move down"><ArrowDown className="h-3.5 w-3.5" /></Button>
                    </div>
                  </td>
                  <td className="px-2 py-2"><Input value={d.brand_code} onChange={(e) => set(p.id, { brand_code: e.target.value })} className="h-9 w-24 font-mono" /></td>
                  <td className="px-2 py-2"><Input value={d.description} onChange={(e) => set(p.id, { description: e.target.value })} className="h-9 min-w-[220px]" /></td>
                  <td className="px-2 py-2"><Input value={d.unit_type} onChange={(e) => set(p.id, { unit_type: e.target.value })} className="h-9 w-24" /></td>
                  <td className="px-2 py-2">
                    <div className="relative w-28">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input value={d.price} inputMode="decimal" onChange={(e) => set(p.id, { price: e.target.value })}
                        className={cn('h-9 pl-6 tabular-nums', parseDollarsToCents(d.price) === null && 'border-red-500')} />
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <input type="checkbox" checked={d.active} onChange={(e) => set(p.id, { active: e.target.checked })} className="h-4 w-4 accent-[#C8102E]" aria-label="Active" />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <Button size="sm" variant={dirty ? 'default' : 'ghost'} disabled={!dirty || busy !== null} onClick={() => save(p.id, d)} className="h-8">
                      {busy === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    </Button>
                  </td>
                </tr>
              );
            })}
            <tr className="bg-muted/30">
              <td className="px-2 py-2 text-center text-muted-foreground"><Plus className="h-4 w-4 inline" /></td>
              <td className="px-2 py-2"><Input value={adding.brand_code} placeholder="6935B" onChange={(e) => setAdding({ ...adding, brand_code: e.target.value })} className="h-9 w-24 font-mono" /></td>
              <td className="px-2 py-2"><Input value={adding.description} placeholder="New product 750 mL" onChange={(e) => setAdding({ ...adding, description: e.target.value })} className="h-9 min-w-[220px]" /></td>
              <td className="px-2 py-2"><Input value={adding.unit_type} onChange={(e) => setAdding({ ...adding, unit_type: e.target.value })} className="h-9 w-24" /></td>
              <td className="px-2 py-2">
                <div className="relative w-28">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input value={adding.price} inputMode="decimal" placeholder="0.00" onChange={(e) => setAdding({ ...adding, price: e.target.value })} className="h-9 pl-6 tabular-nums" />
                </div>
              </td>
              <td />
              <td className="px-2 py-2 text-right">
                <Button size="sm" className="h-8" disabled={busy !== null || !adding.brand_code.trim() || !adding.description.trim() || !adding.price.trim()} onClick={() => save(null, adding)}>
                  {busy === 'new' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add'}
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
