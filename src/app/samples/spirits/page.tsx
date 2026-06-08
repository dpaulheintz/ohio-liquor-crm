'use client';

import { useState, useCallback } from 'react';
import { submitSamplePull } from '@/app/actions/samples';
import { SPIRIT_PRODUCTS, SPIRIT_CATEGORIES } from '@/lib/sample-data';

// ─── Constants ────────────────────────────────────────────────────────────────

const GOLD = '#C5A572';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SpiritLine {
  id: number;
  product: string;
  quantity: number;
}

let lineIdCounter = 1;

// ─── Main component ───────────────────────────────────────────────────────────

export default function SpiritSamplePage() {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<SpiritLine[]>([{ id: lineIdCounter++, product: '', quantity: 1 }]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const updateLine = useCallback((id: number, field: keyof SpiritLine, value: string | number) => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, [field]: value } : l)));
  }, []);

  const addLine = useCallback(() => {
    setLines((prev) => [...prev, { id: lineIdCounter++, product: '', quantity: 1 }]);
  }, []);

  const removeLine = useCallback((id: number) => {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.id !== id) : prev));
  }, []);

  const canSubmit = name.trim() && category && lines.every((l) => l.product && l.quantity > 0);

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await submitSamplePull({
        pull_type: 'spirits',
        person_name: name,
        category,
        account_name: null,
        notes: notes || null,
        items: lines.map((l) => ({
          item_name: l.product,
          item_category: 'Spirits',
          size: null,
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
    setNotes('');
    setLines([{ id: lineIdCounter++, product: '', quantity: 1 }]);
    setSubmitted(false);
  }

  // ── Success screen ──────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-dvh bg-[#0a0a0a] flex flex-col items-center justify-center px-6 text-center">
        <div className="text-5xl mb-4">&#127867;</div>
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
          Spirit Sample Pull
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
            {SPIRIT_CATEGORIES.map((cat) => (
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

        {/* Spirit lines */}
        <div className="space-y-3">
          <label className="text-xs uppercase tracking-widest text-zinc-500 font-medium">Spirits *</label>
          {lines.map((line) => (
            <div key={line.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
              <select
                value={line.product}
                onChange={(e) => updateLine(line.id, 'product', e.target.value)}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#C5A572]/60 appearance-none"
              >
                <option value="" className="text-zinc-600">Select spirit...</option>
                {SPIRIT_PRODUCTS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              {/* Quantity stepper */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">Quantity</span>
                <div className="flex items-center gap-0">
                  <button
                    type="button"
                    onClick={() => updateLine(line.id, 'quantity', Math.max(1, line.quantity - 1))}
                    className="h-9 w-9 rounded-l-lg border border-zinc-700 bg-zinc-800 text-lg text-zinc-300 hover:bg-zinc-700 transition-colors"
                  >
                    −
                  </button>
                  <span className="h-9 w-12 border-t border-b border-zinc-700 bg-zinc-900 flex items-center justify-center text-sm font-mono font-semibold text-white">
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateLine(line.id, 'quantity', line.quantity + 1)}
                    className="h-9 w-9 rounded-r-lg border border-zinc-700 bg-zinc-800 text-lg text-zinc-300 hover:bg-zinc-700 transition-colors"
                  >
                    +
                  </button>
                </div>
              </div>
              {/* Remove button */}
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
          ))}
          <button
            type="button"
            onClick={addLine}
            className="w-full rounded-lg border border-dashed border-zinc-700 py-2.5 text-sm text-zinc-400 hover:border-zinc-500 hover:text-zinc-300 transition-colors"
          >
            + Add Another Spirit
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
