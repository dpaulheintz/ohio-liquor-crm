'use client';

import { useState, useTransition } from 'react';
import { Ban, Loader2, Trash2, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  blockArcadeInitials,
  removeArcadeScore,
  unblockArcadeInitials,
  type ArcadeAdminData,
  type ArcadeAdminEntry,
} from '@/app/actions/arcade';

function fmtScore(game: string, v: number): string {
  if (game.startsWith('paint-')) return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
  if (game === 'rush') return `$${v.toLocaleString()}`;
  return v.toLocaleString();
}

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export function ArcadeLeaderboardsClient({ data }: { data: ArcadeAdminData }) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [newBlock, setNewBlock] = useState('');

  function run(key: string, fn: () => Promise<string | void>) {
    setBusy(key);
    startTransition(async () => {
      try {
        const msg = await fn();
        if (msg) toast.success(msg);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Something went wrong');
      } finally {
        setBusy(null);
      }
    });
  }

  const remove = (e: ArcadeAdminEntry) =>
    run(`rm-${e.id}`, async () => {
      await removeArcadeScore(e.id);
      return `Removed ${e.initials}`;
    });
  const block = (initials: string) =>
    run(`blk-${initials}`, async () => {
      const { removed } = await blockArcadeInitials(initials);
      setNewBlock('');
      return `Blocked ${initials.toUpperCase()}${removed ? ` and removed ${removed} entr${removed === 1 ? 'y' : 'ies'}` : ''}`;
    });
  const unblock = (initials: string) =>
    run(`unb-${initials}`, async () => {
      await unblockArcadeInitials(initials);
      return `Unblocked ${initials}`;
    });

  const total = data.boards.reduce((n, b) => n + b.entries.length, 0);

  return (
    <div className="space-y-8">
      <p className="text-sm text-muted-foreground">
        Week of {new Date(`${data.weekStart}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        {' · '}{total} entr{total === 1 ? 'y' : 'ies'}. Kids see the top 10 per board. <b>Remove</b> deletes one entry;
        {' '}<b>Block</b> also stops those initials from being used again and removes all of them this week.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {data.boards.map((b) => (
          <section key={b.game} className="rounded-lg border bg-card">
            <header className="flex items-baseline justify-between border-b px-4 py-2.5">
              <h2 className="font-semibold">{b.name}</h2>
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                {b.order === 'asc' ? 'Fastest time' : 'High score'}
              </span>
            </header>
            {b.entries.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted-foreground">No entries this week.</p>
            ) : (
              <ul className="divide-y">
                {b.entries.map((e) => (
                  <li key={e.id} className={`flex items-center gap-3 px-4 py-2 text-sm ${e.rank > 10 ? 'opacity-55' : ''}`}>
                    <span className="w-6 text-right tabular-nums text-muted-foreground">{e.rank}</span>
                    <span className="font-mono font-bold tracking-widest">{e.initials}</span>
                    <span className="tabular-nums">{fmtScore(b.game, e.score)}</span>
                    <span className="ml-auto hidden text-xs text-muted-foreground md:inline">{fmtWhen(e.created_at)}</span>
                    <Button
                      size="sm" variant="ghost" className="h-8 px-2 ml-auto md:ml-0" disabled={pending}
                      onClick={() => remove(e)} aria-label={`Remove ${e.initials}`}
                    >
                      {busy === `rm-${e.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      <span className="ml-1">Remove</span>
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="h-8 px-2 text-destructive hover:text-destructive" disabled={pending}
                      onClick={() => block(e.initials)} aria-label={`Block ${e.initials}`}
                    >
                      {busy === `blk-${e.initials}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
                      <span className="ml-1">Block</span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold">Blocked initials</h2>
        <form
          className="flex items-center gap-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (/^[A-Za-z]{3}$/.test(newBlock)) block(newBlock.toUpperCase());
            else toast.error('Initials must be 3 letters A-Z');
          }}
        >
          <Input
            value={newBlock} maxLength={3} placeholder="ABC" aria-label="Initials to block"
            onChange={(ev) => setNewBlock(ev.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
            className="h-9 w-24 font-mono tracking-widest uppercase"
          />
          <Button type="submit" size="sm" disabled={pending || newBlock.length !== 3}>Add to blocklist</Button>
        </form>
        {data.adminBlocked.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {data.adminBlocked.map((b) => (
              <span key={b.initials} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 font-mono text-sm">
                {b.initials}
                <button
                  type="button" className="ml-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
                  disabled={pending} onClick={() => unblock(b.initials)} aria-label={`Unblock ${b.initials}`}
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer">Built-in list ({data.builtInBlocked.length}), edited in src/lib/arcade/blocklist.ts</summary>
          <p className="mt-2 font-mono text-xs leading-6">{data.builtInBlocked.join(' ')}</p>
        </details>
      </section>
    </div>
  );
}
