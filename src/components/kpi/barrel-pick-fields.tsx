'use client';

import { BARREL_TYPES } from '@/lib/types';
import { barrelPickPayout, fmtPayout } from '@/lib/kpi-payouts';
import { cn } from '@/lib/utils';

/**
 * Barrel Pick KPI details: a required Barrel Type, a Half Barrel toggle, and a live payout
 * preview ("Cigar Cask · Half → $250"). Used by the new-visit form and the edit-visit dialog.
 */
export function BarrelPickFields({
  barrelType,
  isHalf,
  quantity,
  onChange,
}: {
  barrelType: string;
  isHalf: boolean;
  quantity: number;
  onChange: (next: { barrelType: string; isHalf: boolean }) => void;
}) {
  const qty = quantity > 0 ? quantity : 1;
  return (
    <div data-barrel-pick className="basis-full space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <div role="radiogroup" aria-label="Barrel type" className="flex flex-wrap rounded border border-border overflow-hidden text-xs">
          {BARREL_TYPES.map((bt) => (
            <button
              key={bt}
              type="button"
              role="radio"
              aria-checked={barrelType === bt}
              onClick={() => onChange({ barrelType: bt, isHalf })}
              className={cn(
                'px-2 py-1 border-l first:border-l-0 border-border transition-colors',
                barrelType === bt ? 'bg-primary text-white font-semibold' : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              {bt}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isHalf}
            onChange={(e) => onChange({ barrelType, isHalf: e.target.checked })}
            className="h-3.5 w-3.5 accent-primary"
          />
          Half Barrel
        </label>
      </div>
      <p data-barrel-payout className="text-xs">
        {barrelType ? (
          <span className="font-medium text-foreground">
            {barrelType} · {isHalf ? 'Half' : 'Full'}{qty > 1 ? ` ×${qty}` : ''} → {fmtPayout(barrelPickPayout(barrelType, isHalf, qty))}
          </span>
        ) : (
          <span className="text-amber-600">Choose a barrel type</span>
        )}
      </p>
    </div>
  );
}
