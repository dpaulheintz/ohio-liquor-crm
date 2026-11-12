'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FraudAttemptRow } from '@/app/actions/fraud-training';
import { LOCATIONS, TRAINING_PATH, locationLabel, quarterLabel } from '@/lib/fraud-training/game';

interface CardInfo { id: string; round: number; sender: string; content: string; answer: string; lesson: string; whatToDo: string }

const PUBLIC_URL = `https://ohio-liquor-crm-opal.vercel.app${TRAINING_PATH}`;
const selectCls = 'h-9 rounded-md border bg-background px-2 text-sm';
const personKey = (a: FraudAttemptRow) => `${a.first_name.trim().toLowerCase()}|${a.last_name.trim().toLowerCase()}|${a.location}`;
const fmtWhen = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function csvCell(v: unknown): string {
  if (v == null) return '';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function FraudTrainingClient({ quarter, quarters, attempts, cards }: { quarter: string; quarters: string[]; attempts: FraudAttemptRow[]; cards: CardInfo[] }) {
  const router = useRouter();
  const [loc, setLoc] = useState('');
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(() => attempts.filter((a) => !loc || a.location === loc), [attempts, loc]);

  // one row per person: best passing attempt, or best attempt if they haven't passed yet
  const people = useMemo(() => {
    const best = new Map<string, FraudAttemptRow>();
    for (const a of rows) {
      const b = best.get(personKey(a));
      const better = !b || (a.passed && !b.passed) || (a.passed === b.passed && (a.score > b.score || (a.score === b.score && a.completed_at < b.completed_at)));
      if (better) best.set(personKey(a), a);
    }
    return [...best.values()].sort((x, y) => Number(y.passed) - Number(x.passed) || y.completed_at.localeCompare(x.completed_at));
  }, [rows]);

  const stats = useMemo(() => {
    const completed = people.filter((p) => p.passed);
    const perLoc = LOCATIONS.map((l) => ({ ...l, n: completed.filter((p) => p.location === l.value).length }));
    const passRate = rows.length ? Math.round((rows.filter((a) => a.passed).length / rows.length) * 100) : null;
    const avgScore = people.length ? Math.round(people.reduce((s, p) => s + p.score, 0) / people.length) : null;
    const avgPct = people.length ? Math.round(people.reduce((s, p) => s + p.percent, 0) / people.length) : null;
    return { completed: completed.length, perLoc, passRate, avgScore, avgPct, attempts: rows.length, people: people.length };
  }, [people, rows]);

  const mostMissed = useMemo(() => {
    const shown = new Map<string, number>(), missed = new Map<string, number>();
    for (const a of rows) {
      for (const id of a.dealt_card_ids ?? []) shown.set(id, (shown.get(id) ?? 0) + 1);
      for (const id of a.missed_card_ids ?? []) missed.set(id, (missed.get(id) ?? 0) + 1);
    }
    const byId = new Map(cards.map((c) => [c.id, c]));
    return [...missed.entries()]
      .map(([id, m]) => ({ card: byId.get(id), id, missed: m, shown: shown.get(id) ?? m }))
      .sort((a, b) => b.missed / b.shown - a.missed / a.shown || b.missed - a.missed)
      .slice(0, 10);
  }, [rows, cards]);

  const table = showAll ? rows : people;

  function exportCsv() {
    const header = ['First name', 'Last name', 'Location', 'Quarter', 'Score', 'Correct', 'Total', 'Percent', 'Badge', 'Passed', 'Completed (ET)', 'Minutes', 'Completion code'];
    const lines = table.map((a) => [a.first_name, a.last_name, locationLabel(a.location), a.quarter, a.score, a.correct_count, a.total_count, a.percent, a.badge, a.passed ? 'Yes' : 'No', fmtWhen(a.completed_at), Math.round(a.duration_seconds / 6) / 10, a.completion_code]);
    const csv = [header, ...lines].map((r) => r.map(csvCell).join(',')).join('\n');
    const el = document.createElement('a');
    el.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    el.download = `fraud-training-${quarter}${loc ? `-${loc}` : ''}${showAll ? '-all-attempts' : ''}.csv`;
    el.click();
    URL.revokeObjectURL(el.href);
  }

  const card = (label: string, value: string, sub?: string) => (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Quarter" value={quarter} onChange={(e) => router.push(`/admin/fraud-training?q=${e.target.value}`)} className={selectCls}>
          {quarters.map((q) => <option key={q} value={q}>{quarterLabel(q)}</option>)}
        </select>
        <select aria-label="Location" value={loc} onChange={(e) => setLoc(e.target.value)} className={selectCls}>
          <option value="">All locations</option>
          {LOCATIONS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
        <Button variant="outline" size="sm" className="ml-auto" onClick={exportCsv} disabled={!table.length}><Download className="mr-1.5 h-4 w-4" />CSV</Button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {card('Completions', String(stats.completed), `${stats.people} people tried · ${stats.attempts} attempts`)}
        {card('Pass rate', stats.passRate == null ? '—' : `${stats.passRate}%`, 'of all attempts')}
        {card('Average score', stats.avgScore == null ? '—' : stats.avgScore.toLocaleString('en-US'), stats.avgPct == null ? undefined : `${stats.avgPct}% correct (best attempt per person)`)}
        <div className="rounded-lg border bg-card p-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Completions by location</div>
          <ul className="mt-1 space-y-0.5 text-sm">
            {stats.perLoc.map((l) => <li key={l.value} className="flex justify-between"><span>{l.label}</span><span className="font-semibold tabular-nums">{l.n}</span></li>)}
          </ul>
        </div>
      </div>

      <section className="rounded-lg border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
          <h2 className="font-semibold">{showAll ? 'All attempts' : 'People'} · {quarterLabel(quarter)}</h2>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="h-4 w-4" />Show all attempts
          </label>
        </header>
        {!showAll && <p className="px-4 pt-2 text-xs text-muted-foreground">Each person&apos;s best passing attempt (or their best try if they haven&apos;t passed yet).</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Name</th><th className="px-3 py-2">Location</th><th className="px-3 py-2 text-right">Score</th>
                <th className="px-3 py-2">Badge</th><th className="px-3 py-2">Passed</th><th className="px-3 py-2">Date / time (ET)</th><th className="px-3 py-2">Code</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {table.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-2 font-medium">{a.first_name} {a.last_name}</td>
                  <td className="px-3 py-2">{locationLabel(a.location)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{a.score.toLocaleString('en-US')} <span className="text-muted-foreground">· {Math.floor(a.percent)}%</span></td>
                  <td className="px-3 py-2">{a.badge}</td>
                  <td className="px-3 py-2">{a.passed ? <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-800">Passed</span> : <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">Not yet</span>}</td>
                  <td className="whitespace-nowrap px-3 py-2">{fmtWhen(a.completed_at)}</td>
                  <td className="px-3 py-2 font-mono">{a.completion_code}</td>
                </tr>
              ))}
              {table.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No completions yet for {quarterLabel(quarter)}.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border bg-card">
        <header className="border-b px-4 py-2.5">
          <h2 className="font-semibold">Most-missed cards · pre-shift talking points</h2>
        </header>
        {mostMissed.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">Nothing missed yet this quarter.</p>
        ) : (
          <ol className="divide-y">
            {mostMissed.map((m) => (
              <li key={m.id} className="px-4 py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{m.card ? `${m.card.answer === 'scam' ? 'Scam' : 'Legit'} · ${m.card.sender}` : m.id}</span>
                  <span className="text-muted-foreground tabular-nums">missed {m.missed} of {m.shown} times shown ({Math.round((m.missed / m.shown) * 100)}%)</span>
                </div>
                {m.card && (
                  <>
                    <p className="mt-1 text-muted-foreground italic">&ldquo;{m.card.content.length > 160 ? m.card.content.slice(0, 157) + '…' : m.card.content}&rdquo;</p>
                    <p className="mt-1">{m.card.lesson} <b>Do this:</b> {m.card.whatToDo}</p>
                  </>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="rounded-xl border bg-card p-5 flex flex-col sm:flex-row items-center gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/qr/fraud-training.png" alt="Fraud training QR code" className="h-32 w-32 rounded-lg" />
        <div className="space-y-2 text-center sm:text-left">
          <p className="text-sm font-medium text-foreground">Share &ldquo;Scam or Legit?&rdquo; with staff</p>
          <a href={TRAINING_PATH} target="_blank" rel="noopener" className="block text-xs font-mono text-primary underline underline-offset-2 break-all">{PUBLIC_URL}</a>
          <div className="flex flex-wrap justify-center sm:justify-start gap-3 text-xs">
            <a href="/qr/fraud-training.png" download className="text-muted-foreground underline underline-offset-2">PNG</a>
            <a href="/qr/fraud-training.svg" download className="text-muted-foreground underline underline-offset-2">SVG</a>
            <a href="/qr/fraud-training-print.png" download className="text-muted-foreground underline underline-offset-2">Print PNG</a>
          </div>
        </div>
      </section>
    </div>
  );
}
