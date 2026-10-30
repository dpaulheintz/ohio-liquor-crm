'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Check, Loader2, Pencil, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { moveReqProduct, saveReqProduct, setReqProductActive } from '@/app/actions/retail-requisitions';
import type { RetailReqProduct } from '@/lib/retail-requisitions';

export function SkuListClient({ products }: { products: RetailReqProduct[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');
  const [newSku, setNewSku] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function run(key: string, action: () => Promise<{ ok: true } | { ok: false; error: string }>, onDone?: () => void) {
    setBusy(key);
    try {
      const res = await action();
      if (!res.ok) return void toast.error(res.error);
      onDone?.();
      router.refresh();
    } catch {
      toast.error('Something went wrong. Try again.');
    } finally {
      setBusy(null);
    }
  }

  function startEdit(p: RetailReqProduct) {
    setEditing(p.id);
    setSku(p.sku);
    setDescription(p.description);
  }

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run('add', () => saveReqProduct(null, { sku: newSku, description: newDescription }), () => {
            setNewSku('');
            setNewDescription('');
            toast.success('Added to the end of the list');
          });
        }}
        className="rounded-xl border bg-card p-4 flex flex-wrap items-end gap-2"
      >
        <Input value={newSku} onChange={(e) => setNewSku(e.target.value.toUpperCase())} placeholder="SKU" aria-label="New SKU" className="h-11 w-28 font-mono" />
        <Input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Description" aria-label="New description" className="h-11 min-w-48 flex-1" />
        <Button type="submit" disabled={busy !== null || !newSku.trim() || !newDescription.trim()} className="h-11">
          {busy === 'add' ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />} Add SKU
        </Button>
      </form>

      <ul className="rounded-xl border bg-card divide-y">
        {products.map((p, i) => (
          <li key={p.id} className={cn('flex flex-wrap items-center gap-2 px-3 py-2', !p.active && 'opacity-60')}>
            <div className="flex shrink-0">
              <Button variant="ghost" size="icon" className="h-11 w-9" disabled={busy !== null || i === 0} aria-label={`Move ${p.sku} up`} onClick={() => run(`up-${p.id}`, () => moveReqProduct(p.id, 'up'))}>
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-11 w-9" disabled={busy !== null || i === products.length - 1} aria-label={`Move ${p.sku} down`} onClick={() => run(`down-${p.id}`, () => moveReqProduct(p.id, 'down'))}>
                <ArrowDown className="h-4 w-4" />
              </Button>
            </div>
            {editing === p.id ? (
              <>
                <Input value={sku} onChange={(e) => setSku(e.target.value.toUpperCase())} aria-label="SKU" className="h-11 w-24 font-mono" />
                <Input value={description} onChange={(e) => setDescription(e.target.value)} aria-label="Description" className="h-11 min-w-40 flex-1" />
                <Button size="icon" className="h-11 w-11" disabled={busy !== null} aria-label="Save" onClick={() => run(`edit-${p.id}`, () => saveReqProduct(p.id, { sku, description }), () => setEditing(null))}>
                  {busy === `edit-${p.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="Cancel" onClick={() => setEditing(null)}>
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <div className="min-w-0 flex-1 basis-40">
                  <p className="text-sm font-medium leading-snug">{p.description}{!p.active && <span className="ml-2 text-xs font-normal text-muted-foreground">Inactive</span>}</p>
                  <p className="text-xs font-mono text-muted-foreground">{p.sku}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`Edit ${p.sku}`} onClick={() => startEdit(p)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" className="h-11" disabled={busy !== null} onClick={() => run(`active-${p.id}`, () => setReqProductActive(p.id, !p.active))}>
                  {p.active ? 'Deactivate' : 'Activate'}
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
