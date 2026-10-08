'use client';

import { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';
import { fmtTicketTime } from '@/lib/secret-shopper';

export interface TimerState {
  orderPlacedAt: string | null;
  foodDeliveredAt: string | null;
  manualOpen: boolean;
  manualMinutes: string;
}

function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [active]);
  return now;
}

export function TicketTimer({ value, onChange }: { value: TimerState; onChange: (patch: Partial<TimerState>) => void }) {
  const running = value.orderPlacedAt != null && value.foodDeliveredAt == null;
  const stopped = value.orderPlacedAt != null && value.foodDeliveredAt != null;
  const now = useNow(running);

  const elapsed = value.orderPlacedAt
    ? ((stopped ? new Date(value.foodDeliveredAt!).getTime() : now) - new Date(value.orderPlacedAt).getTime()) / 1000
    : 0;

  function reset() {
    if (!window.confirm('Reset the ticket timer?')) return;
    onChange({ orderPlacedAt: null, foodDeliveredAt: null });
  }

  return (
    <div className="rounded-xl border border-primary/25 bg-primary/[0.04] p-4 space-y-3">
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest font-semibold text-primary">
        <Timer className="h-4 w-4" />
        Ticket Time — order to food delivered
      </div>

      {!value.orderPlacedAt && (
        <button
          type="button"
          onClick={() => onChange({ orderPlacedAt: new Date().toISOString(), foodDeliveredAt: null, manualOpen: false, manualMinutes: '' })}
          className="w-full rounded-xl bg-primary py-4 text-base font-semibold text-white active:scale-[0.99] transition-transform"
        >
          I just ordered — start timer
        </button>
      )}

      {running && (
        <>
          <div className="text-center">
            <div className="font-mono text-5xl font-bold tabular-nums text-foreground" aria-live="off">{fmtClock(elapsed)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Started {new Date(value.orderPlacedAt!).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · keeps counting if your phone locks
            </p>
          </div>
          <button
            type="button"
            onClick={() => onChange({ foodDeliveredAt: new Date().toISOString() })}
            className="w-full rounded-xl bg-foreground py-4 text-base font-semibold text-white active:scale-[0.99] transition-transform"
          >
            Food arrived — stop timer
          </button>
        </>
      )}

      {stopped && (
        <div className="text-center space-y-1">
          <div className="text-3xl font-serif font-bold text-foreground">{fmtTicketTime(Math.round(elapsed))}</div>
          <button type="button" onClick={reset} className="text-xs text-muted-foreground underline underline-offset-2">
            Reset
          </button>
        </div>
      )}

      {!stopped && !running && (
        value.manualOpen ? (
          <label className="block space-y-1.5">
            <span className="text-sm text-muted-foreground">How many minutes from order to food?</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={360}
                value={value.manualMinutes}
                onChange={(e) => onChange({ manualMinutes: e.target.value })}
                placeholder="e.g. 18"
                className="w-28 rounded-lg border bg-white px-3 py-3 text-base focus:outline-none focus:border-primary/60"
              />
              <span className="text-sm text-muted-foreground">minutes</span>
              <button
                type="button"
                onClick={() => onChange({ manualOpen: false, manualMinutes: '' })}
                className="ml-auto text-xs text-muted-foreground underline underline-offset-2"
              >
                Cancel
              </button>
            </div>
          </label>
        ) : (
          <button
            type="button"
            onClick={() => onChange({ manualOpen: true })}
            className="text-sm text-muted-foreground underline underline-offset-2"
          >
            Forgot to start the timer?
          </button>
        )
      )}
    </div>
  );
}
