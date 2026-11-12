'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { applyProductFile, previewProductFile, type ProductDiff } from '@/app/actions/bottle-sales';
import { fmtUsd, isDelisted, toCents, type OhlqProduct } from '@/lib/bottle-sales';

export function ProductsClient({ products }: { products: OhlqProduct[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [diff, setDiff] = useState<ProductDiff | null>(null);

  async function onPick(f: File | undefined) {
    if (!f) return;
    const text = await f.text();
    start(async () => {
      try {
        const d = await previewProductFile(text);
        setFile({ name: f.name, text }); setDiff(d);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not read that file');
      } finally {
        if (fileRef.current) fileRef.current.value = '';
      }
    });
  }

  function apply() {
    if (!file) return;
    start(async () => {
      try {
        const n = await applyProductFile(file.text);
        toast.success(`Applied ${n} products. New prices apply to new entries only.`);
        setFile(null); setDiff(null); router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not apply');
      }
    });
  }

  const money = (v: number) => fmtUsd(toCents(v));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          The OHLQ product file is the price list. <b>Paid per bottle</b> = case price ÷ units per case, rounded to the cent (what OHLQ pays us).
          Price changes only affect entries logged after the upload.
        </p>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onPick(e.target.files?.[0])} />
        <Button onClick={() => fileRef.current?.click()} disabled={pending}>
          {pending && !diff ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}Upload new OHLQ product file
        </Button>
      </div>

      {diff && file && (
        <section className="space-y-3 rounded-lg border-2 border-amber-300 bg-amber-50/60 p-4">
          <h2 className="font-semibold">Review before applying: {file.name}</h2>
          <p className="text-sm">
            {diff.total} products in the file · <b>{diff.added.length}</b> new · <b>{diff.priceChanges.length}</b> price change{diff.priceChanges.length === 1 ? '' : 's'} ·{' '}
            {diff.otherChanges.length} other change{diff.otherChanges.length === 1 ? '' : 's'} · {diff.unchanged} unchanged
            {diff.missingFromFile.length > 0 && <> · {diff.missingFromFile.length} not in the file (kept as is)</>}
          </p>
          {diff.added.length > 0 && (
            <div><h3 className="text-sm font-semibold">New SKUs</h3>
              <ul className="text-sm">{diff.added.map((p) => <li key={p.sku}>{p.sku} · {p.display_name} · case {money(p.case_price)} / {p.units_per_case}</li>)}</ul></div>
          )}
          {diff.priceChanges.length > 0 && (
            <div><h3 className="text-sm font-semibold">Price changes</h3>
              <ul className="text-sm">{diff.priceChanges.map((c, i) => <li key={i}>{c.sku} · {c.name} · {c.field}: {money(c.from)} → <b>{money(c.to)}</b></li>)}</ul></div>
          )}
          {diff.otherChanges.length > 0 && (
            <div><h3 className="text-sm font-semibold">Other changes</h3>
              <ul className="text-sm">{diff.otherChanges.map((c, i) => <li key={i}>{c.sku} · {c.name} · {c.field}: {c.from || '—'} → {c.to || '—'}</li>)}</ul></div>
          )}
          {diff.missingFromFile.length > 0 && (
            <div><h3 className="text-sm font-semibold">In Bottle Sales but not in this file</h3>
              <ul className="text-sm text-muted-foreground">{diff.missingFromFile.map((c) => <li key={c.sku}>{c.sku} · {c.name}</li>)}</ul></div>
          )}
          <div className="flex gap-2">
            <Button onClick={apply} disabled={pending}>{pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Apply changes</Button>
            <Button variant="ghost" onClick={() => { setDiff(null); setFile(null); }} disabled={pending}>Cancel</Button>
          </div>
        </section>
      )}

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">SKU</th><th className="px-3 py-2">Product</th><th className="px-3 py-2">Group</th><th className="px-3 py-2">Detail code</th>
              <th className="px-3 py-2 text-right">Case $</th><th className="px-3 py-2 text-right">Units</th>
              <th className="px-3 py-2 text-right">Paid / btl</th><th className="px-3 py-2 text-right">Wholesale</th><th className="px-3 py-2 text-right">MSRP</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {products.map((p) => (
              <tr key={p.sku} className={isDelisted(p) ? 'text-muted-foreground' : ''}>
                <td className="whitespace-nowrap px-3 py-2 font-mono">{p.sku}</td>
                <td className="px-3 py-2"><div className="font-medium">{p.display_name}</div><div className="text-xs text-muted-foreground">{p.item_name}</div></td>
                <td className="px-3 py-2">{p.report_group}</td>
                <td className="px-3 py-2">{p.detail_code}{p.status && p.status !== 'Active' ? ` · ${p.status}` : ''}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(p.case_price)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{p.units_per_case}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(p.paid_per_bottle)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(p.wholesale_price)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{money(p.retail_price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
