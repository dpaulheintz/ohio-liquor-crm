'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Metric, Entry } from '@/lib/eos/scorecard';
import type { BarrelWithMilestones } from '@/lib/eos/barrels';
import type { Todo } from '@/lib/eos/todos';
import type { Opportunity } from '@/lib/eos/opportunities';
import type { Headline } from '@/lib/eos/headlines';
import type { Meeting, MeetingNote } from '@/lib/eos/meetings';
import { evaluateGoal, formatOperator, formatValue } from '@/lib/eos/scorecard-utils';
import { startMeetingAction } from './meetings/actions';
import { createHeadlineAction } from './headlines/actions';
import { createTodoAction, toggleTodoAction } from './todos/actions';
import { EOS_TEAM_MEMBERS } from '@/lib/eos/team';
import SmartAddButton from '@/components/eos/SmartAddButton';
import { cn } from '@/lib/utils';

type Props = {
  metrics: Metric[];
  entries: Entry[];
  weekStarts: string[];
  barrels: BarrelWithMilestones[];
  todos: Todo[];
  opportunities: Opportunity[];
  initialHeadlines: Headline[];
  recentMeeting: Meeting | null;
  recentNotes: MeetingNote[];
  recentMeetingTodos: Todo[];
};

const BARREL_STATUS_CONFIG: Record<string, { label: string; cls: string; dotCls: string }> = {
  complete:    { label: 'Complete',    cls: 'bg-[#C9963A] text-[#0E0B07] font-semibold',  dotCls: 'bg-[#C9963A]' },
  on_track:    { label: 'On Track',    cls: 'bg-[#0F2E2B] text-[#5B9E94]',    dotCls: 'bg-[#5B9E94]' },
  off_track:   { label: 'Off Track',   cls: 'bg-[#2E0F0F] text-[#C0392B]',      dotCls: 'bg-[#C0392B]' },
  not_started: { label: 'Not Started', cls: 'bg-[#2A1F14] text-[#B8A99A]',       dotCls: 'bg-[#6B5A4A]' },
};

const HEADLINE_TYPE_CONFIG: Record<string, { label: string; cls: string }> = {
  good_news:       { label: 'Good News',    cls: 'bg-[#2E1E08] text-[#D4821A]' },
  customer_win:    { label: 'Customer Win', cls: 'bg-[#0F2E2B] text-[#5B9E94]' },
  employee_update: { label: 'Team Update',  cls: 'bg-[#0F2E2B] text-[#5B9E94]' },
};

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function shortWeekLabel(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

function fmtFullDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

function fmtShortDate(d: string | null): string {
  if (!d) return '';
  const [y, mo, day] = d.split('-').map(Number);
  return `${MONTHS[mo - 1]} ${day}, ${y}`;
}

function fmtDuration(start: string | null, end: string | null): string {
  if (!start) return '—';
  if (!end) return 'In progress';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h === 0 ? `${m}m` : `${h}h ${m}m`;
}

function ratingColor(r: number): string {
  if (r >= 8) return 'text-[#5B9E94]';
  if (r >= 6) return 'text-[#D4821A]';
  return 'text-[#C0392B]';
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function EosDashboardClient({
  metrics,
  entries,
  weekStarts,
  barrels,
  todos,
  opportunities,
  initialHeadlines,
  recentMeeting,
  recentNotes,
  recentMeetingTodos,
}: Props) {
  const router = useRouter();
  const [showStartModal, setShowStartModal] = useState(false);
  const [starting, setStarting] = useState(false);
  const [localHeadlines, setLocalHeadlines] = useState(initialHeadlines);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<Headline['headline_type']>('good_news');
  const [addingHeadline, setAddingHeadline] = useState(false);
  const [localTodos, setLocalTodos] = useState(todos);
  const [togglingTodos, setTogglingTodos] = useState<Set<string>>(new Set());
  const [dashTodoTitle, setDashTodoTitle] = useState('');
  const [dashTodoOwner, setDashTodoOwner] = useState('');
  const [dashTodoDue, setDashTodoDue] = useState('');
  const [dashTodoAdding, setDashTodoAdding] = useState(false);

  // Build entry lookup
  const entryMap = new Map<string, string>();
  for (const e of entries) {
    if (e.value) entryMap.set(`${e.metric_id}:${e.week_start}`, e.value);
  }

  const currentWeekStart = weekStarts[0] ?? '';
  const today = todayStr();

  // ── Scorecard health ──────────────────────────────────────────────
  const onTrackCount = metrics.filter(m => {
    const val = entryMap.get(`${m.id}:${currentWeekStart}`);
    return val ? evaluateGoal(val, m.goal_operator, m.goal_value, m.metric_type) : false;
  }).length;
  const scoreHealthColor =
    onTrackCount >= 16 ? 'text-[#5B9E94]' : onTrackCount >= 10 ? 'text-[#D4821A]' : 'text-[#C0392B]';

  // ── Barrels ───────────────────────────────────────────────────────
  const barrelCounts = {
    complete:    barrels.filter(b => b.status === 'complete').length,
    on_track:    barrels.filter(b => b.status === 'on_track').length,
    off_track:   barrels.filter(b => b.status === 'off_track').length,
    not_started: barrels.filter(b => b.status === 'not_started').length,
  };
  const sortedBarrels = [
    ...barrels.filter(b => b.barrel_type === 'company'),
    ...barrels.filter(b => b.barrel_type === 'individual'),
  ];

  // ── Todos ─────────────────────────────────────────────────────────
  const incompleteTodos = localTodos.filter(t => !t.completed);
  const overdueTodos = incompleteTodos.filter(t => t.due_date && t.due_date < today);

  // ── Opportunities ─────────────────────────────────────────────────
  const openOpps = opportunities.filter(o => o.status !== 'solved');
  const shortOpps = openOpps.filter(o => o.term === 'short').length;
  const longOpps = openOpps.filter(o => o.term === 'long').length;

  // ── Headlines ─────────────────────────────────────────────────────
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const thisWeekHeadlines = localHeadlines
    .filter(h => h.created_at.slice(0, 10) >= sevenDaysAgo)
    .slice(0, 5);

  // ── Recent meeting ────────────────────────────────────────────────
  const concludeNote = recentNotes.find(n => n.section === 'conclude')?.content ?? '';

  // ── Handlers ──────────────────────────────────────────────────────
  async function handleStart() {
    setStarting(true);
    try {
      const id = await startMeetingAction();
      router.push(`/eos/meetings/${id}/run`);
    } catch {
      alert('Failed to start meeting.');
      setStarting(false);
    }
  }

  async function handleDashToggle(todo: Todo) {
    const next = !todo.completed;
    setTogglingTodos(prev => new Set(prev).add(todo.id));
    setLocalTodos(prev => prev.map(t => t.id === todo.id ? { ...t, completed: next } : t));
    try {
      await toggleTodoAction(todo.id, next);
    } catch {
      setLocalTodos(prev => prev.map(t => t.id === todo.id ? { ...t, completed: todo.completed } : t));
    } finally {
      setTogglingTodos(prev => { const n = new Set(prev); n.delete(todo.id); return n; });
    }
  }

  async function handleDashCreateTodo() {
    if (!dashTodoTitle.trim()) return;
    setDashTodoAdding(true);
    try {
      const created = await createTodoAction({ title: dashTodoTitle.trim(), owner_name: dashTodoOwner.trim(), owner_email: '', due_date: dashTodoDue });
      setLocalTodos(prev => [...prev, created]);
      setDashTodoTitle('');
      setDashTodoOwner('');
      setDashTodoDue('');
    } catch {
      alert('Failed to add to-do.');
    } finally {
      setDashTodoAdding(false);
    }
  }

  async function handleAddHeadline() {
    if (!newTitle.trim()) return;
    setAddingHeadline(true);
    try {
      const h = await createHeadlineAction({ title: newTitle.trim(), headline_type: newType, owner_name: '' });
      setLocalHeadlines(prev => [h, ...prev]);
      setNewTitle('');
    } catch {
      alert('Failed to add headline.');
    } finally {
      setAddingHeadline(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-serif text-3xl font-bold text-[#F5ECD7]" style={{ letterSpacing: '-0.02em' }}>High Bank EOS</h1>
          <p className="text-[#B8A99A] mt-1 text-sm">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            <span className="mx-2 text-[#6B5A4A]">·</span>
            Your weekly operating system
          </p>
        </div>
        <button
          onClick={() => setShowStartModal(true)}
          className="px-5 py-2.5 rounded-lg bg-[#C9963A] hover:bg-[#E8B86D] text-[#0E0B07] text-sm font-semibold transition-colors flex items-center gap-2 shrink-0"
        >
          <span>▶</span> Start Level 10
        </button>
      </div>

      {/* ── Row 1: Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Scorecard health */}
        <div className="rounded-xl border border-[#3D2E1E] bg-[#1C1510] px-5 py-4 flex flex-col gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#B8A99A]">Scorecard Health</p>
          <p className={cn('text-3xl font-bold', scoreHealthColor)}>
            {onTrackCount}<span className="text-lg font-normal text-[#6B5A4A]"> / {metrics.length}</span>
          </p>
          <p className="text-xs text-[#B8A99A]">metrics on track this week</p>
          <Link href="/eos/scorecard" className="text-xs text-[#C9963A] hover:text-[#E8B86D] mt-auto pt-2 transition-colors">
            View Scorecard →
          </Link>
        </div>

        {/* Barrels */}
        <div className="rounded-xl border border-[#3D2E1E] bg-[#1C1510] px-5 py-4 flex flex-col gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#B8A99A]">Barrels</p>
          <p className="text-3xl font-bold text-[#F5ECD7]">{barrels.length}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs mt-0.5">
            <span className="text-[#C9963A]">{barrelCounts.complete} complete</span>
            <span className="text-[#5B9E94]">{barrelCounts.on_track} on track</span>
            <span className="text-[#C0392B]">{barrelCounts.off_track} off track</span>
            <span className="text-[#B8A99A]">{barrelCounts.not_started} not started</span>
          </div>
          <Link href="/eos/barrels" className="text-xs text-[#C9963A] hover:text-[#E8B86D] mt-auto pt-2 transition-colors">
            View Barrels →
          </Link>
        </div>

        {/* Open To-Dos */}
        <div className="rounded-xl border border-[#3D2E1E] bg-[#1C1510] px-5 py-4 flex flex-col gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#B8A99A]">Open To-Dos</p>
          <p className="text-3xl font-bold text-[#F5ECD7]">{incompleteTodos.length}</p>
          {overdueTodos.length > 0 ? (
            <p className="text-xs text-[#C0392B] font-medium">{overdueTodos.length} overdue</p>
          ) : (
            <p className="text-xs text-[#6B5A4A]">none overdue</p>
          )}
          <Link href="/eos/todos" className="text-xs text-[#C9963A] hover:text-[#E8B86D] mt-auto pt-2 transition-colors">
            View To-Dos →
          </Link>
        </div>

        {/* Open Opportunities */}
        <div className="rounded-xl border border-[#3D2E1E] bg-[#1C1510] px-5 py-4 flex flex-col gap-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#B8A99A]">Open Opportunities</p>
          <p className="text-3xl font-bold text-[#F5ECD7]">{openOpps.length}</p>
          <p className="text-xs text-[#B8A99A]">
            {shortOpps} short-term · {longOpps} long-term
          </p>
          <Link href="/eos/opportunities" className="text-xs text-[#C9963A] hover:text-[#E8B86D] mt-auto pt-2 transition-colors">
            View Opportunities →
          </Link>
        </div>
      </div>

      {/* ── Row 2: Scorecard Snapshot + Headlines ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">
        {/* Scorecard Snapshot */}
        <div className="rounded-xl border border-[#3D2E1E] bg-[#1C1510] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[#F5ECD7]">Scorecard Snapshot</h3>
            <Link href="/eos/scorecard" className="text-xs text-[#C9963A] hover:text-[#E8B86D] transition-colors">
              View full scorecard →
            </Link>
          </div>

          {metrics.length === 0 ? (
            <p className="text-xs text-[#6B5A4A] py-4 text-center">No metrics yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#3D2E1E]">
                    <th className="text-left pb-2 pr-3 font-medium text-[#B8A99A] w-full">Metric</th>
                    <th className="text-right pb-2 px-2 font-medium text-[#B8A99A] whitespace-nowrap">Goal</th>
                    {weekStarts.map(ws => (
                      <th key={ws} className="text-center pb-2 px-1.5 font-medium text-[#B8A99A] whitespace-nowrap w-10">
                        {shortWeekLabel(ws)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#3D2E1E]">
                  {metrics.map(m => (
                    <tr key={m.id} className="hover:bg-[#2A1F14]/40">
                      <td className="py-1.5 pr-3 text-[#F5ECD7] truncate max-w-[180px]">{m.title}</td>
                      <td className="py-1.5 px-2 text-right text-[#B8A99A] whitespace-nowrap">
                        {formatOperator(m.goal_operator)} {formatValue(m.goal_value, m.metric_type)}
                      </td>
                      {weekStarts.map((ws, i) => {
                        const val = entryMap.get(`${m.id}:${ws}`);
                        const met = val ? evaluateGoal(val, m.goal_operator, m.goal_value, m.metric_type) : null;
                        return (
                          <td key={ws} className="py-1.5 px-1.5 text-center">
                            <span className={cn(
                              'inline-block w-2.5 h-2.5 rounded-full',
                              met === true ? 'bg-[#5B9E94]' :
                              met === false ? 'bg-[#C0392B]' :
                              'bg-[#3D2E1E]',
                              i === 0 && 'ring-1 ring-offset-1 ring-offset-[#111] ring-[#3D2E1E]',
                            )} title={val ? `${val}` : 'No entry'} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* This Week's Headlines */}
        <div className="rounded-xl border border-[#3D2E1E] bg-[#1C1510] p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[#F5ECD7]">This Week&apos;s Headlines</h3>
            <Link href="/eos/headlines" className="text-xs text-[#C9963A] hover:text-[#E8B86D] transition-colors">
              View all →
            </Link>
          </div>

          <div className="flex-1 space-y-2">
            {thisWeekHeadlines.length === 0 ? (
              <p className="text-xs text-[#6B5A4A] py-2">No headlines this week yet.</p>
            ) : (
              thisWeekHeadlines.map(h => {
                const cfg = HEADLINE_TYPE_CONFIG[h.headline_type] ?? HEADLINE_TYPE_CONFIG.good_news;
                return (
                  <div key={h.id} className="flex items-start gap-2.5 py-1.5 border-b border-[#3D2E1E]/60 last:border-0">
                    <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none mt-0.5', cfg.cls)}>
                      {cfg.label}
                    </span>
                    <span className="text-xs text-[#F5ECD7] leading-snug">{h.title}</span>
                  </div>
                );
              })
            )}
          </div>

          {/* Inline add */}
          <div className="mt-4 pt-4 border-t border-[#3D2E1E]">
            <div className="flex gap-1.5 mb-2">
              {(['good_news', 'customer_win', 'employee_update'] as const).map(type => {
                const cfg = HEADLINE_TYPE_CONFIG[type];
                return (
                  <button
                    key={type}
                    onClick={() => setNewType(type)}
                    className={cn(
                      'rounded px-2 py-1 text-[10px] font-semibold transition-colors',
                      newType === type ? cfg.cls : 'bg-[#2A1F14] text-[#B8A99A] hover:text-[#F5ECD7]',
                    )}
                  >
                    {cfg.label}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddHeadline()}
                placeholder="Share good news…"
                className="flex-1 rounded-lg bg-[#1C1510] border border-[#3D2E1E] px-3 py-1.5 text-xs text-[#F5ECD7] placeholder:text-[#6B5A4A] focus:outline-none focus:border-[#3D2E1E]"
              />
              <button
                onClick={handleAddHeadline}
                disabled={addingHeadline || !newTitle.trim()}
                className="px-3 py-1.5 rounded-lg bg-[#C9963A] hover:bg-[#E8B86D] disabled:opacity-40 text-[#0E0B07] text-xs font-semibold transition-colors"
              >
                {addingHeadline ? '…' : '+ Add'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 3: Barrels Progress + Recent Meeting ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">
        {/* Barrels Progress */}
        <div className="rounded-xl border border-[#3D2E1E] bg-[#1C1510] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[#F5ECD7]">Barrels Progress</h3>
            <Link href="/eos/barrels" className="text-xs text-[#C9963A] hover:text-[#E8B86D] transition-colors">
              View all barrels →
            </Link>
          </div>

          {sortedBarrels.length === 0 ? (
            <p className="text-xs text-[#6B5A4A] py-4 text-center">No barrels yet.</p>
          ) : (
            <div className="space-y-0 divide-y divide-[#3D2E1E]/60">
              {sortedBarrels.map(barrel => {
                const total = barrel.milestones.length;
                const done = barrel.milestones.filter(ms => ms.completed).length;
                const cfg = BARREL_STATUS_CONFIG[barrel.status] ?? BARREL_STATUS_CONFIG.not_started;
                return (
                  <div key={barrel.id} className="flex items-center gap-3 py-2.5">
                    <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap', cfg.cls)}>
                      {cfg.label}
                    </span>
                    <span className="flex-1 text-xs text-[#F5ECD7] truncate">{barrel.title}</span>
                    {barrel.owner_name && (
                      <span className="text-[10px] text-[#6B5A4A] shrink-0 hidden sm:block">{barrel.owner_name}</span>
                    )}
                    {total > 0 && (
                      <div className="shrink-0 flex items-center gap-1.5">
                        <div className="w-16 h-1.5 bg-[#2A1F14] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#C9963A] rounded-full"
                            style={{ width: `${(done / total) * 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-[#B8A99A]">{done}/{total}</span>
                      </div>
                    )}
                    {barrel.due_date && (
                      <span className="text-[10px] text-[#6B5A4A] shrink-0 hidden md:block">
                        {fmtShortDate(barrel.due_date)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Meeting */}
        <div className="rounded-xl border border-[#3D2E1E] bg-[#1C1510] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[#F5ECD7]">Recent Meeting</h3>
            {recentMeeting && (
              <Link href={`/eos/meetings/${recentMeeting.id}`} className="text-xs text-[#C9963A] hover:text-[#E8B86D] transition-colors">
                View summary →
              </Link>
            )}
          </div>

          {recentMeeting ? (
            <div className="space-y-4">
              {/* Meeting meta */}
              <div className="space-y-1">
                <p className="text-xs text-[#F5ECD7]">{fmtFullDate(recentMeeting.started_at)}</p>
                <div className="flex items-center gap-3 text-xs text-[#B8A99A]">
                  <span>{fmtDuration(recentMeeting.started_at, recentMeeting.ended_at)}</span>
                  {recentMeeting.rating && (
                    <span className={cn('font-semibold', ratingColor(recentMeeting.rating))}>
                      {recentMeeting.rating}/10
                    </span>
                  )}
                </div>
              </div>

              {/* Todos from meeting */}
              {recentMeetingTodos.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B5A4A] mb-1.5">
                    To-Dos Created
                  </p>
                  <div className="space-y-1">
                    {recentMeetingTodos.slice(0, 3).map(t => (
                      <div key={t.id} className="flex items-start gap-2">
                        <div className={cn(
                          'mt-0.5 w-3.5 h-3.5 rounded border shrink-0 flex items-center justify-center',
                          t.completed ? 'bg-[#C9963A] border-[#C9963A]' : 'border-[#3D2E1E]',
                        )}>
                          {t.completed && (
                            <svg className="w-2 h-2" viewBox="0 0 10 10" fill="none">
                              <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                        <span className={cn(
                          'text-xs leading-snug',
                          t.completed ? 'line-through text-[#6B5A4A]' : 'text-[#F5ECD7]',
                        )}>
                          {t.title}
                        </span>
                      </div>
                    ))}
                    {recentMeetingTodos.length > 3 && (
                      <p className="text-[10px] text-[#6B5A4A] pl-5">
                        +{recentMeetingTodos.length - 3} more…
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Conclude notes preview */}
              {concludeNote && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#6B5A4A] mb-1">
                    Conclude Notes
                  </p>
                  <p className="text-xs text-[#B8A99A] leading-relaxed line-clamp-3">
                    {concludeNote}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
              <p className="text-sm text-[#B8A99A]">No meetings yet.</p>
              <p className="text-xs text-[#6B5A4A]">Start your first Level 10 Meeting to see the recap here.</p>
              <button
                onClick={() => setShowStartModal(true)}
                className="mt-1 px-4 py-2 rounded-lg bg-[#C9963A] hover:bg-[#E8B86D] text-[#0E0B07] text-xs font-medium transition-colors"
              >
                ▶ Start Level 10
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Row 4: Open To-Dos ── */}
      {(() => {
        const sortedIncompleteTodos = [...incompleteTodos].sort((a, b) => {
          if (!a.due_date && !b.due_date) return 0;
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return a.due_date.localeCompare(b.due_date);
        });
        const displayedTodos = sortedIncompleteTodos.slice(0, 8);
        const inputCls = 'rounded-lg bg-[#1C1510] border border-[#3D2E1E] px-3 py-1.5 text-xs text-[#F5ECD7] placeholder:text-[#6B5A4A] focus:outline-none focus:border-[#3D2E1E]';
        return (
          <div className="rounded-xl border border-[#3D2E1E] bg-[#1C1510] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[#F5ECD7]">Open To-Dos</h3>
              {incompleteTodos.length > 0 && (
                <Link href="/eos/todos" className="text-xs text-[#C9963A] hover:text-[#E8B86D] transition-colors">
                  View all {incompleteTodos.length} →
                </Link>
              )}
            </div>

            {displayedTodos.length === 0 && incompleteTodos.length === 0 ? (
              <p className="text-xs text-[#6B5A4A] py-2 text-center">No open to-dos. Great work!</p>
            ) : (
              <div className="space-y-1">
                {displayedTodos.map(todo => {
                  const overdue = !todo.completed && todo.due_date && todo.due_date < today;
                  const isToday = !todo.completed && todo.due_date === today;
                  return (
                    <div key={todo.id} className="flex items-center gap-3 py-2 border-b border-[#3D2E1E]/60 last:border-0">
                      <button
                        onClick={() => handleDashToggle(todo)}
                        disabled={togglingTodos.has(todo.id)}
                        className={cn(
                          'shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors',
                          todo.completed ? 'bg-[#C9963A] border-[#C9963A]' : 'border-[#3D2E1E] hover:border-[#C9963A]',
                          togglingTodos.has(todo.id) && 'opacity-50',
                        )}
                      >
                        {todo.completed && (
                          <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none">
                            <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </button>
                      <span className={cn('flex-1 text-xs truncate', todo.completed ? 'line-through text-[#6B5A4A]' : 'text-[#F5ECD7]')}>
                        {todo.title}
                      </span>
                      {todo.owner_name && <span className="text-[10px] text-[#6B5A4A] shrink-0 hidden sm:block">{todo.owner_name}</span>}
                      {todo.due_date && (
                        <span className={cn(
                          'shrink-0 text-[10px] px-1.5 py-0.5 rounded',
                          overdue ? 'bg-[#2E0F0F] text-[#C0392B] font-medium' :
                          isToday ? 'bg-[#2E1E08] text-[#D4821A]' :
                          'text-[#6B5A4A]',
                        )}>
                          {overdue ? 'Overdue' : isToday ? 'Today' : fmtShortDate(todo.due_date)}
                        </span>
                      )}
                    </div>
                  );
                })}
                {incompleteTodos.length > 8 && (
                  <Link href="/eos/todos" className="block text-center text-xs text-[#C9963A] hover:text-[#E8B86D] pt-2 transition-colors">
                    View all {incompleteTodos.length} to-dos →
                  </Link>
                )}
              </div>
            )}

            {/* Inline add */}
            <div className="mt-4 pt-4 border-t border-[#3D2E1E] flex flex-wrap gap-2">
              <input
                type="text"
                value={dashTodoTitle}
                onChange={e => setDashTodoTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleDashCreateTodo()}
                placeholder="New to-do…"
                className={cn(inputCls, 'flex-1 min-w-[160px]')}
              />
              <select
                value={EOS_TEAM_MEMBERS.find(m => m.name === dashTodoOwner)?.email || ''}
                onChange={e => {
                  const m = EOS_TEAM_MEMBERS.find(m => m.email === e.target.value);
                  setDashTodoOwner(m?.name ?? '');
                }}
                className={cn(inputCls, 'w-36')}
              >
                <option value="">— Owner —</option>
                {EOS_TEAM_MEMBERS.map(m => (
                  <option key={m.email} value={m.email}>{m.name}</option>
                ))}
              </select>
              <input
                type="date"
                value={dashTodoDue}
                onChange={e => setDashTodoDue(e.target.value)}
                className={cn(inputCls, 'w-36')}
              />
              <button
                onClick={handleDashCreateTodo}
                disabled={dashTodoAdding || !dashTodoTitle.trim()}
                className="px-3 py-1.5 rounded-lg bg-[#C9963A] hover:bg-[#E8B86D] disabled:opacity-40 text-[#0E0B07] text-xs font-semibold transition-colors"
              >
                {dashTodoAdding ? '…' : '+ Add'}
              </button>
            </div>
          </div>
        );
      })()}

      <SmartAddButton pageContext="dashboard" />

      {/* ── Start Meeting Modal ── */}
      {showStartModal && (
        <div className="fixed inset-0 bg-[#0E0B07]/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#1C1510] border border-[#3D2E1E] rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-5 text-center">
              <div className="text-3xl mb-3">▶</div>
              <h2 className="text-lg font-semibold text-[#F5ECD7] mb-2">Start a New Level 10 Meeting?</h2>
              <p className="text-sm text-[#B8A99A]">This will create a new meeting record and open the live runner.</p>
            </div>
            <div className="flex gap-3 px-6 pb-5">
              <button
                onClick={() => setShowStartModal(false)}
                className="flex-1 py-2.5 rounded-lg border border-[#3D2E1E] text-[#F5ECD7] text-sm hover:bg-[#2A1F14] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleStart}
                disabled={starting}
                className="flex-1 py-2.5 rounded-lg bg-[#C9963A] hover:bg-[#E8B86D] disabled:opacity-50 text-[#0E0B07] text-sm font-semibold transition-colors"
              >
                {starting ? 'Starting…' : 'Start Meeting'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
