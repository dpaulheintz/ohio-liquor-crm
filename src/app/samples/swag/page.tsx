'use client';

import { useState, useCallback } from 'react';
import { submitSamplePull } from '@/app/actions/samples';
import { SWAG_CATEGORIES, SWAG_ITEM_CATEGORIES, getSizesForType } from '@/lib/sample-data';

// ─── Constants ────────────────────────────────────────────────────────────────

const GOLD = '#C5A572';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SwagLine {
  id: number;
  swagCategory: string; // "Crewnecks", "T-Shirts", etc.
  itemName: string;
  size: string;
  quantity: number;
}

let lineIdCounter = 1;

// ─── Main component ───────────────────────────────────────────────────────────

export default function SwagSamplePage() {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [accountName, setAccountName] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<SwagLine[]>([
    { id: lineIdCounter++, swagCategory: '', itemName: '', size: '', quantity: 1 },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const needsAccount = category === 'Wholesale Account Samples' || category === 'Prospect Samples';

  const updateLine = useCallback((id: number, updates: Partial<SwagLine>) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)));
  }, []);

  const addLine = useCallback(() => {
    setLines((prev) => [
      ...prev,
      { id: lineIdCounter++, swagCategory: '', itemName: '', size: '', quantity: 1 },
    ]);
  }, []);

  const removeLine = useCallback((id: number) => {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev));
  }, []);

  const canSubmit =
    name.trim() &&
    category &&
    lines.every((l) => l.itemName && l.size && l.quantity > 0) &&
    (!needsAccount || accountName.trim());

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await submitSamplePull({
        pull_type: 'swag',
        person_name: name,
        category,
        account_name: needsAccount ? accountName : null,
        notes: notes || null,
        items: lines.map((l) => ({
          item_name: l.itemName,
          item_category: l.swagCategory || null,
          size: l.size || null,
          quantity: l.quantity,
        })),
      });
      setSubmitted(true);
    } catch {
      alert('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setName('');
    setCategory('');
    setAccountName('');
    setNotes('');
    setLines([{ id: lineIdCounter++, swagCategory: '', itemName: '', size: '', quantity: 1 }]);
    setSubmitted(false);
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-dvh bg-[#0a0a0a] flex flex-col items-center justify-center px-6 text-center">
        <div className="text-5xl mb-4">&#128085;</div>
        <h1 className="font-serif text-2xl font-bold text-white mb-2">Samples Logged!</h1>
        <p className="text-zinc-400 mb-8">Thank you, {name}.</p>
        <button
          onClick={reset}
          className="rounded-lg px-8 py-3 text-sm font-semibold transition-colors"
          style={{ backgroundColor: GOLD, color: '#000' }}
        >
          Log Another Pull
        </button>
      </div>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-dvh bg-[#0a0a0a] text-white">
      {/* Header */}
      <div className="border-b border-zinc-800 px-5 py-4">
        <h1 className="font-serif text-xl font-bold tracking-wide" style={{ color: GOLD }}>
          Swag Sample Pull
        </h1>
        <p className="text-xs text-zinc-500 mt-0.5">High Bank Distillery</p>
      </div>

      <div className="px-5 py-5 space-y-5 max-w-lg mx-auto pb-32">
        {/* Name */}
        <div className="space-y-1.5">
          <label className="text-xs uppercase tracking-widest text-zinc-500 font-medium">Your Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="First and Last"
            autoComplete="name"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#C5A572]/60"
          />
        </div>

        {/* Category */}
        <div className="space-y-1.5">
          <label className="text-xs uppercase tracking-widest text-zinc-500 font-medium">Reason *</label>
          <div className="grid grid-cols-2 gap-2">
            {SWAG_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className="rounded-lg border px-3 py-2.5 text-sm text-left transition-all"
                style={{
                  borderColor: category === cat ? GOLD : '#3f3f46',
                  backgroundColor: category === cat ? GOLD + '18' : 'transparent',
                  color: category === cat ? GOLD : '#a1a1aa',
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Account name (conditional) */}
        {needsAccount && (
          <div className="space-y-1.5">
            <label className="text-xs uppercase tracking-widest text-zinc-500 font-medium">Account Name *</label>
            <input
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="Bar or restaurant name"
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#C5A572]/60"
            />
          </div>
        )}

        {/* Swag lines */}
        <div className="space-y-3">
          <label className="text-xs uppercase tracking-widest text-zinc-500 font-medium">Swag Items *</label>
          {lines.map((line) => {
            const catDef = SWAG_ITEM_CATEGORIES.find((c) => c.name === line.swagCategory);
            const sizes = catDef ? getSizesForType(catDef.sizeType) : [];
            const items = catDef?.items ?? [];

            return (
              <div key={line.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
                {/* Swag category picker */}
                <select
                  value={line.swagCategory}
                  onChange={(e) => updateLine(line.id, { swagCategory: e.target.value, itemName: '', size: '' })}
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#C5A572]/60 appearance-none"
                >
                  <option value="" className="text-zinc-600">Pick a category...</option>
                  {SWAG_ITEM_CATEGORIES.map((c) => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>

                {/* Item picker (filtered by category) */}
                {line.swagCategory && (
                  <select
                    value={line.itemName}
                    onChange={(e) => {
                      const autoSize = sizes.length === 1 ? sizes[0] : '';
                      updateLine(line.id, { itemName: e.target.value, size: autoSize });
                    }}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#C5A572]/60 appearance-none"
                  >
                    <option value="" className="text-zinc-600">Select item...</option>
                    {items.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                )}

                {/* Size picker */}
                {line.itemName && sizes.length > 1 && (
                  <div className="space-y-1">
                    <span className="text-xs text-zinc-500">Size</span>
                    <div className="flex flex-wrap gap-1.5">
                      {sizes.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => updateLine(line.id, { size: s })}
                          className="rounded-md px-3 py-1.5 text-xs font-medium transition-all border"
                          style={{
                            borderColor: line.size === s ? GOLD : '#3f3f46',
                            backgroundColor: line.size === s ? GOLD + '20' : 'transparent',
                            color: line.size === s ? GOLD : '#a1a1aa',
                          }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quantity stepper */}
                {line.itemName && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-zinc-500">Quantity</span>
                    <div className="flex items-center gap-0">
                      <button
                        type="button"
                        onClick={() => updateLine(line.id, { quantity: Math.max(1, line.quantity - 1) })}
                        className="h-9 w-9 rounded-l-lg border border-zinc-700 bg-zinc-800 text-lg text-zinc-300 hover:bg-zinc-700 transition-colors"
                      >
                        −
                      </button>
                      <span className="h-9 w-12 border-t border-b border-zinc-700 bg-zinc-900 flex items-center justify-center text-sm font-mono font-semibold text-white">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateLine(line.id, { quantity: line.quantity + 1 })}
                        className="h-9 w-9 rounded-r-lg border border-zinc-700 bg-zinc-800 text-lg text-zinc-300 hover:bg-zinc-700 transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}

                {/* Remove */}
                {lines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLine(line.id)}
                    className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={addLine}
            className="w-full rounded-lg border border-dashed border-zinc-700 py-2.5 text-sm text-zinc-400 hover:border-zinc-500 hover:text-zinc-300 transition-colors"
          >
            + Add Another Item
          </button>
        </div>

        {/* Notes */}
        <div className="space-y-1.5">
          <label className="text-xs uppercase tracking-widest text-zinc-500 font-medium">Notes <span className="text-zinc-700">(optional)</span></label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Anything else to note..."
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#C5A572]/60 resize-none"
          />
        </div>
      </div>

      {/* Sticky submit */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-zinc-800 bg-[#0a0a0a]/95 backdrop-blur-sm px-5 py-4">
        <button
          onClick={handleSubmit}
          disabled={!canSubmit || submitting}
          className="w-full rounded-lg py-3.5 text-sm font-semibold transition-all disabled:opacity-40"
          style={{ backgroundColor: canSubmit && !submitting ? GOLD : '#3f3f46', color: canSubmit ? '#000' : '#71717a' }}
        >
          {submitting ? 'Saving...' : 'Submit Pull'}
        </button>
      </div>
    </div>
  );
}
