'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Meeting, MeetingNote } from '@/lib/eos/meetings';
import type { Metric, Entry } from '@/lib/eos/scorecard';
import type { BarrelWithMilestones } from '@/lib/eos/barrels';
import type { Todo } from '@/lib/eos/todos';
import type { Opportunity } from '@/lib/eos/opportunities';
import type { Headline } from '@/lib/eos/headlines';
import { formatValue, evaluateGoal, formatOperator } from '@/lib/eos/scorecard-utils';
import {
  saveSectionNoteAction,
  endMeetingAction,
  createMeetingTodoAction,
  carryForwardTodoAction,
  flagForIDSAction,
  updateBarrelStatusInMeetingAction,
  addHeadlineInMeetingAction,
} from '@/app/eos/meetings/actions';
import { toggleTodoAction } from '@/app/eos/todos/actions';
import { updateOpportunityStatusAction } from '@/app/eos/opportunities/actions';
import { cn } from '@/lib/utils';

const SECTIONS = [
  { key: 'segue', name: 'Segue', time: 5 },
  { key: 'scorecard', name: 'Scorecard Review', time: 5 },
  { key: 'barrels', name: 'Barrel Review', time: 5 },
  { key: 'headlines', name: 'Headlines', time: 5 },
  { key: 'todos', name: 'To-Do Review', time: 5 },
  { key: 'ids', name: 'IDS — Opportunities', time: 60 },
  { key: 'conclude', name: 'Conclude', time: 5 },
];

const BARREL_STATUS: Record<string, { label: string; bg: string; text: string }> = {
  not_started: { label: 'Not Started', bg: 'bg-zinc-700', text: 'text-zinc-300' },
  on_track:    { label: 'On Track',    bg: 'bg-blue-900/60', text: 'text-blue-300' },
  off_track:   { label: 'Off Track',   bg: 'bg-red-900/60',  text: 'text-red-300' },
  complete:    { label: 'Complete',    bg: 'bg-green-900/60', text: 'text-green-300' },
};

const HEADLINE_TYPES: Record<string, { label: string; dot: string }> = {
  good_news:       { label: 'Good News',       dot: 'bg-yellow-500' },
  customer_win:    { label: 'Customer Win',    dot: 'bg-green-500' },
  employee_update: { label: 'Employee Update', dot: 'bg-blue-500' },
};

const PRIORITY_DOT: Record<string, string> = {
  critical: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-yellow-500', low: 'bg-zinc-500',
};

type Props = {
  meeting: Meeting;
  initialNotes: MeetingNote[];
  metrics: Metric[];
  entries: Entry[];
  currentWeek: string;
  barrels: BarrelWithMilestones[];
  todos: Todo[];
  opportunities: Opportunity[];
  headlines: Headline[];
};

function fmtElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtShortDate(d: string | null) {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function RunnerClient({
  meeting,
  initialNotes,
  metrics,
  entries,
  currentWeek,
  barrels: initialBarrels,
  todos: initialTodos,
  opportunities: initialOpportunities,
  headlines: initialHeadlines,
}: Props) {
  const router = useRouter();

  // ── Navigation ──
  const [currentSection, setCurrentSection] = useState(0);

  // ── Timers ──
  const [elapsed, setElapsed] = useState(() =>
    Math.max(0, Math.floor((Date.now() - new Date(meeting.started_at!).getTime()) / 1000)),
  );
  const [sectionTimers, setSectionTimers] = useState<number[]>(() =>
    SECTIONS.map(s => s.time * 60),
  );
  const [paused, setPaused] = useState(false);

  // ── Section notes ──
  const [notes, setNotes] = useState<Record<string, string>>(() => {
    const n: Record<string, string> = {};
    for (const note of initialNotes) n[note.section] = note.content ?? '';
    return n;
  });

  // ── Live data ──
  const [barrels, setBarrels] = useState(initialBarrels);
  const [todos, setTodos] = useState(initialTodos);
  const [opportunities, setOpportunities] = useState(initialOpportunities);
  const [headlines, setHeadlines] = useState(initialHeadlines);
  const [meetingTodos, setMeetingTodos] = useState<Todo[]>([]);

  // ── UI state ──
  const [sharedHeadlines, setSharedHeadlines] = useState<Set<string>>(new Set());
  const [readHeadlines, setReadHeadlines] = useState<Set<string>>(new Set());
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [selectedOppId, setSelectedOppId] = useState<string | null>(null);
  const [showEndModal, setShowEndModal] = useState(false);
  const [rating, setRating] = useState(8);
  const [endNotes, setEndNotes] = useState('');
  const [ending, setEnding] = useState(false);

  // ── Inline forms ──
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [newTodoOwner, setNewTodoOwner] = useState('');
  const [newTodoDue, setNewTodoDue] = useState('');
  const [newHeadlineTitle, setNewHeadlineTitle] = useState('');
  const [newHeadlineType, setNewHeadlineType] = useState('good_news');

  // ── Scorecard data ──
  const entryMap = new Map<string, string>();
  for (const e of entries) {
    if (e.value) entryMap.set(e.metric_id, e.value);
  }

  // ── Elapsed timer ──
  useEffect(() => {
    const iv = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - new Date(meeting.started_at!).getTime()) / 1000)));
    }, 1000);
    return () => clearInterval(iv);
  }, [meeting.started_at]);

  // ── Section timer ──
  useEffect(() => {
    if (paused) return;
    const iv = setInterval(() => {
      setSectionTimers(prev => {
        const next = [...prev];
        next[currentSection] = Math.max(0, next[currentSection] - 1);
        return next;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [currentSection, paused]);

  // ── Derived ──
  const section = SECTIONS[currentSection];
  const timerSeconds = sectionTimers[currentSection];
  const timerExpired = timerSeconds <= 0;

  const onTrackCount = metrics.filter(m => {
    const val = entryMap.get(m.id);
    return val ? evaluateGoal(val, m.goal_operator, m.goal_value, m.metric_type) : false;
  }).length;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentHeadlines = headlines.filter(h => new Date(h.created_at) >= sevenDaysAgo);
  const showAllHeadlines = recentHeadlines.length === 0;
  const displayHeadlines = showAllHeadlines ? headlines : recentHeadlines;

  const todayStr = new Date().toISOString().slice(0, 10);
  const weekAgoStr = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const lastWeekTodos = todos.filter(t => t.due_date && t.due_date >= weekAgoStr && t.due_date <= todayStr);
  const overdueTodos = todos.filter(t => !t.completed && t.due_date && t.due_date < todayStr);

  const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const openOpps = opportunities
    .filter(o => o.status === 'open' || o.status === 'in_progress')
    .sort((a, b) => (priorityOrder[a.priority ?? ''] ?? 99) - (priorityOrder[b.priority ?? ''] ?? 99));
  const selectedOpp = opportunities.find(o => o.id === selectedOppId) ?? null;

  const companyBarrels = barrels.filter(b => b.barrel_type === 'company');
  const individualBarrels = barrels.filter(b => b.barrel_type === 'individual');

  // ── Handlers ──
  function goTo(i: number) { if (i >= 0 && i < SECTIONS.length) { setCurrentSection(i); setPaused(false); } }
  function goNext() { currentSection === SECTIONS.length - 1 ? setShowEndModal(true) : goTo(currentSection + 1); }
  function goPrev() { goTo(currentSection - 1); }

  async function handleSaveNote(key: string) {
    try { await saveSectionNoteAction(meeting.id, key, notes[key] ?? ''); } catch { /* best effort */ }
  }

  async function handleEndMeeting() {
    setEnding(true);
    try {
      await endMeetingAction(meeting.id, rating, endNotes);
      router.push(`/eos/meetings/${meeting.id}`);
    } catch {
      alert('Failed to end meeting.');
      setEnding(false);
    }
  }

  async function handleFlagForIDS(title: string) {
    if (flagged.has(title)) return;
    setFlagged(prev => new Set(prev).add(title));
    try {
      const opp = await flagForIDSAction(title);
      setOpportunities(prev => [opp, ...prev]);
    } catch {
      setFlagged(prev => { const n = new Set(prev); n.delete(title); return n; });
    }
  }

  async function handleToggleTodo(id: string, completed: boolean) {
    setTodos(prev => prev.map(t => t.id === id ? { ...t, completed, completed_at: completed ? new Date().toISOString() : null } : t));
    try { await toggleTodoAction(id, completed); } catch { setTodos(prev => prev.map(t => t.id === id ? { ...t, completed: !completed } : t)); }
  }

  async function handleCarryForward(id: string) {
    const d = new Date(); d.setDate(d.getDate() + 7);
    const dueStr = d.toISOString().slice(0, 10);
    setTodos(prev => prev.map(t => t.id === id ? { ...t, due_date: dueStr } : t));
    try { await carryForwardTodoAction(id); } catch { /* best effort */ }
  }

  async function handleCreateTodo() {
    if (!newTodoTitle.trim()) return;
    try {
      const todo = await createMeetingTodoAction(newTodoTitle, newTodoOwner, newTodoDue, meeting.id);
      setTodos(prev => [...prev, todo]);
      setMeetingTodos(prev => [...prev, todo]);
      setNewTodoTitle(''); setNewTodoOwner(''); setNewTodoDue('');
    } catch { alert('Failed to create to-do.'); }
  }

  async function handleBarrelStatus(id: string, status: string) {
    setBarrels(prev => prev.map(b => b.id === id ? { ...b, status: status as BarrelWithMilestones['status'] } : b));
    try { await updateBarrelStatusInMeetingAction(id, status); } catch { /* best effort */ }
  }

  async function handleAddHeadline() {
    if (!newHeadlineTitle.trim()) return;
    try {
      const h = await addHeadlineInMeetingAction(newHeadlineTitle, newHeadlineType, '');
      setHeadlines(prev => [h, ...prev]);
      setNewHeadlineTitle('');
    } catch { alert('Failed to add headline.'); }
  }

  async function handleOppStatus(id: string, status: string) {
    setOpportunities(prev => prev.map(o => o.id === id ? { ...o, status: status as Opportunity['status'] } : o));
    try { await updateOpportunityStatusAction(id, status); } catch { /* best effort */ }
  }

  // ── Input styles ──
  const inputCls = 'rounded-lg bg-[#0a140c] border border-green-900/30 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-green-600 placeholder:text-zinc-700 transition-colors';

  // ═══ SECTION RENDERERS ═══════════════════════════════════════════════════════

  function renderSectionContent() {
    switch (section.key) {
      case 'segue': return renderSegue();
      case 'scorecard': return renderScorecard();
      case 'barrels': return renderBarrels();
      case 'headlines': return renderHeadlines();
      case 'todos': return renderTodos();
      case 'ids': return renderIDS();
      case 'conclude': return renderConclude();
      default: return null;
    }
  }

  function renderSegue() {
    return (
      <div className="space-y-6">
        <div className="rounded-xl bg-green-900/10 border border-green-900/30 p-5">
          <p className="text-green-300 text-sm leading-relaxed">
            Each person shares one <strong>personal win</strong> and one <strong>professional win</strong> from the past week.
          </p>
        </div>
        {headlines.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Today&apos;s Headlines</h3>
            {Object.entries(HEADLINE_TYPES).map(([type, cfg]) => {
              const items = headlines.filter(h => h.headline_type === type);
              if (items.length === 0) return null;
              return (
                <div key={type} className="mb-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <div className={cn('w-2 h-2 rounded-full', cfg.dot)} />
                    <span className="text-xs text-zinc-500 font-medium">{cfg.label}</span>
                  </div>
                  {items.map(h => (
                    <label key={h.id} className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg hover:bg-green-900/10 cursor-pointer transition-colors">
                      <input
                        type="checkbox"
                        checked={sharedHeadlines.has(h.id)}
                        onChange={() => setSharedHeadlines(prev => {
                          const n = new Set(prev);
                          n.has(h.id) ? n.delete(h.id) : n.add(h.id);
                          return n;
                        })}
                        className="accent-green-600"
                      />
                      <span className={cn('text-sm', sharedHeadlines.has(h.id) ? 'text-zinc-500 line-through' : 'text-zinc-300')}>
                        {h.title}
                      </span>
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  function renderScorecard() {
    return (
      <div>
        <div className="mb-4 rounded-xl bg-green-900/10 border border-green-900/30 px-4 py-3">
          <span className="text-sm text-green-300 font-medium">{onTrackCount} of {metrics.length} metrics on track this week</span>
          {currentWeek && <span className="text-xs text-green-700 ml-2">(week of {fmtShortDate(currentWeek)})</span>}
        </div>
        <div className="space-y-0.5">
          {metrics.map(m => {
            const val = entryMap.get(m.id);
            const hasVal = !!val;
            const met = hasVal ? evaluateGoal(val!, m.goal_operator, m.goal_value, m.metric_type) : false;
            const flagTitle = `Scorecard: ${m.title}`;
            return (
              <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-green-900/10 group/row transition-colors">
                <span className={cn('text-lg font-bold', met ? 'text-green-400' : 'text-red-400')}>{met ? '✓' : '✗'}</span>
                <span className="flex-1 text-sm text-zinc-200 min-w-0 truncate">{m.title}</span>
                <span className="text-sm tabular-nums text-zinc-400 shrink-0">{hasVal ? formatValue(val!, m.metric_type) : '—'}</span>
                <span className="text-xs text-zinc-600 shrink-0">/ {formatOperator(m.goal_operator)} {formatValue(m.goal_value, m.metric_type)}</span>
                {!met && !flagged.has(flagTitle) && (
                  <button onClick={() => handleFlagForIDS(flagTitle)} className="opacity-0 group-hover/row:opacity-100 text-[11px] text-yellow-600 hover:text-yellow-400 transition-all whitespace-nowrap">
                    Flag for IDS
                  </button>
                )}
                {flagged.has(flagTitle) && <span className="text-[11px] text-yellow-700">Flagged</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderBarrelGroup(label: string, items: BarrelWithMilestones[]) {
    if (items.length === 0) return null;
    return (
      <div className="mb-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">{label}</h3>
        <div className="space-y-1">
          {items.map(b => {
            const cfg = BARREL_STATUS[b.status] ?? BARREL_STATUS.not_started;
            const total = b.milestones.length;
            const done = b.milestones.filter(m => m.completed).length;
            const flagTitle = `Barrel: ${b.title}`;
            return (
              <div key={b.id} className="flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-green-900/10 group/row transition-colors">
                <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0', cfg.bg, cfg.text)}>
                  {cfg.label}
                </span>
                <span className="flex-1 text-sm text-zinc-200 min-w-0 truncate">{b.title}</span>
                {b.owner_name && <span className="text-xs text-zinc-500 shrink-0 hidden md:inline">{b.owner_name}</span>}
                {total > 0 && <span className="text-xs text-zinc-600 shrink-0">{done}/{total}</span>}
                <span className="text-xs text-zinc-600 shrink-0">{fmtShortDate(b.due_date)}</span>
                <select
                  value={b.status}
                  onChange={e => handleBarrelStatus(b.id, e.target.value)}
                  onClick={e => e.stopPropagation()}
                  className="text-[11px] bg-transparent border border-green-900/30 rounded px-1 py-0.5 text-zinc-400 focus:outline-none focus:border-green-600"
                >
                  {Object.entries(BARREL_STATUS).map(([v, c]) => (
                    <option key={v} value={v}>{c.label}</option>
                  ))}
                </select>
                {!flagged.has(flagTitle) && (
                  <button onClick={() => handleFlagForIDS(flagTitle)} className="opacity-0 group-hover/row:opacity-100 text-[11px] text-yellow-600 hover:text-yellow-400 transition-all whitespace-nowrap">
                    Flag
                  </button>
                )}
                {flagged.has(flagTitle) && <span className="text-[11px] text-yellow-700">Flagged</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderBarrels() {
    return (
      <div>
        {renderBarrelGroup('Company Barrels', companyBarrels)}
        {renderBarrelGroup('Individual Barrels', individualBarrels)}
        {barrels.length === 0 && <p className="text-sm text-zinc-600 text-center py-8">No barrels set for this quarter.</p>}
      </div>
    );
  }

  function renderHeadlines() {
    return (
      <div className="space-y-5">
        {showAllHeadlines && headlines.length > 0 && (
          <div className="rounded-xl bg-yellow-900/10 border border-yellow-900/30 px-4 py-2.5 text-sm text-yellow-400">
            Showing all headlines — none added this week.
          </div>
        )}

        {Object.entries(HEADLINE_TYPES).map(([type, cfg]) => {
          const items = displayHeadlines.filter(h => h.headline_type === type);
          if (items.length === 0) return null;
          return (
            <div key={type}>
              <div className="flex items-center gap-1.5 mb-2">
                <div className={cn('w-2 h-2 rounded-full', cfg.dot)} />
                <span className="text-xs font-medium text-zinc-500">{cfg.label}</span>
              </div>
              {items.map(h => (
                <label key={h.id} className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg hover:bg-green-900/10 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={readHeadlines.has(h.id)}
                    onChange={() => setReadHeadlines(prev => { const n = new Set(prev); n.has(h.id) ? n.delete(h.id) : n.add(h.id); return n; })}
                    className="accent-green-600"
                  />
                  <span className={cn('text-sm flex-1', readHeadlines.has(h.id) ? 'text-zinc-600 line-through' : 'text-zinc-300')}>{h.title}</span>
                  {h.owner_name && <span className="text-xs text-zinc-600">{h.owner_name}</span>}
                </label>
              ))}
            </div>
          );
        })}

        {headlines.length === 0 && <p className="text-sm text-zinc-600 text-center py-4">No headlines yet.</p>}

        {/* Inline add */}
        <div className="border-t border-green-900/20 pt-4">
          <h4 className="text-xs font-medium text-zinc-500 mb-2">Quick Add Headline</h4>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <input
                type="text"
                value={newHeadlineTitle}
                onChange={e => setNewHeadlineTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddHeadline()}
                className={cn(inputCls, 'w-full')}
                placeholder="Share some good news…"
              />
            </div>
            <select
              value={newHeadlineType}
              onChange={e => setNewHeadlineType(e.target.value)}
              className={cn(inputCls, 'w-36')}
            >
              <option value="good_news">Good News</option>
              <option value="customer_win">Customer Win</option>
              <option value="employee_update">Team Update</option>
            </select>
            <button onClick={handleAddHeadline} className="px-3 py-2 rounded-lg bg-green-800/40 hover:bg-green-800/60 text-green-200 text-sm font-medium transition-colors shrink-0">
              + Add
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderTodos() {
    return (
      <div className="space-y-6">
        {/* Last week's todos */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Last Week&apos;s To-Dos</h3>
          {lastWeekTodos.length === 0 ? (
            <p className="text-sm text-zinc-600 py-2">No to-dos from the past week.</p>
          ) : (
            <div className="space-y-1">
              {lastWeekTodos.map(t => (
                <div key={t.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-green-900/10 transition-colors">
                  <button
                    onClick={() => handleToggleTodo(t.id, !t.completed)}
                    className={cn('w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                      t.completed ? 'bg-green-700 border-green-700' : 'border-zinc-600 hover:border-green-500')}
                  >
                    {t.completed && <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </button>
                  <span className={cn('flex-1 text-sm', t.completed ? 'line-through text-zinc-600' : 'text-zinc-200')}>{t.title}</span>
                  {t.owner_name && <span className="text-xs text-zinc-600 shrink-0">{t.owner_name}</span>}
                  {!t.completed && t.due_date && t.due_date < todayStr && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/50 text-red-400 font-medium shrink-0">Overdue</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Carry forward */}
        {overdueTodos.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Carry Forward</h3>
            <div className="space-y-1">
              {overdueTodos.map(t => (
                <div key={t.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-red-900/5 border border-red-900/20">
                  <span className="flex-1 text-sm text-zinc-300">{t.title}</span>
                  {t.owner_name && <span className="text-xs text-zinc-600 shrink-0">{t.owner_name}</span>}
                  <span className="text-xs text-red-500 shrink-0">{fmtShortDate(t.due_date)}</span>
                  <button
                    onClick={() => handleCarryForward(t.id)}
                    className="text-[11px] px-2 py-1 rounded bg-green-800/40 hover:bg-green-800/60 text-green-300 font-medium transition-colors shrink-0"
                  >
                    Carry Forward +7d
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Create new todo */}
        <div className="border-t border-green-900/20 pt-4">
          <h4 className="text-xs font-medium text-zinc-500 mb-2">Create New To-Do</h4>
          <div className="flex gap-2 items-end flex-wrap">
            <input
              type="text"
              value={newTodoTitle}
              onChange={e => setNewTodoTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateTodo()}
              className={cn(inputCls, 'flex-1 min-w-[200px]')}
              placeholder="Task…"
            />
            <input
              type="text"
              value={newTodoOwner}
              onChange={e => setNewTodoOwner(e.target.value)}
              className={cn(inputCls, 'w-32')}
              placeholder="Owner"
            />
            <input
              type="date"
              value={newTodoDue}
              onChange={e => setNewTodoDue(e.target.value)}
              className={cn(inputCls, 'w-36')}
            />
            <button onClick={handleCreateTodo} className="px-3 py-2 rounded-lg bg-green-800/40 hover:bg-green-800/60 text-green-200 text-sm font-medium transition-colors shrink-0">
              + Add
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderIDS() {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        {/* Left: Issues list */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">
            Open Issues ({openOpps.length})
          </h3>
          <div className="space-y-1 max-h-[50vh] overflow-y-auto">
            {openOpps.map(opp => {
              const dot = PRIORITY_DOT[opp.priority ?? ''] ?? 'bg-zinc-500';
              return (
                <button
                  key={opp.id}
                  onClick={() => setSelectedOppId(opp.id === selectedOppId ? null : opp.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-left transition-colors',
                    selectedOppId === opp.id ? 'bg-green-900/20 ring-1 ring-green-700/50' : 'hover:bg-green-900/10',
                  )}
                >
                  <div className={cn('w-2 h-2 rounded-full shrink-0', dot)} />
                  <span className="flex-1 text-sm text-zinc-200 min-w-0 truncate">{opp.title}</span>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-600 shrink-0">{opp.term}-term</span>
                </button>
              );
            })}
            {openOpps.length === 0 && <p className="text-sm text-zinc-600 text-center py-4">No open issues.</p>}
          </div>

          {/* Quick add todo from IDS */}
          <div className="mt-4 border-t border-green-900/20 pt-4">
            <h4 className="text-xs font-medium text-zinc-500 mb-2">Create To-Do from Discussion</h4>
            <div className="flex gap-2 items-end">
              <input
                type="text"
                value={newTodoTitle}
                onChange={e => setNewTodoTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateTodo()}
                className={cn(inputCls, 'flex-1')}
                placeholder="Action item…"
              />
              <input type="text" value={newTodoOwner} onChange={e => setNewTodoOwner(e.target.value)} className={cn(inputCls, 'w-24')} placeholder="Owner" />
              <button onClick={handleCreateTodo} className="px-3 py-2 rounded-lg bg-green-800/40 hover:bg-green-800/60 text-green-200 text-sm font-medium transition-colors shrink-0">+ Add</button>
            </div>
          </div>
        </div>

        {/* Right: Discussion panel */}
        <div className="rounded-xl border border-green-900/30 bg-[#0a140c] p-5">
          {selectedOpp ? (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-white">{selectedOpp.title}</h3>
              {selectedOpp.description && <p className="text-sm text-zinc-400 leading-relaxed">{selectedOpp.description}</p>}
              <div className="flex items-center gap-3 text-xs text-zinc-500">
                {selectedOpp.owner_name && <span>{selectedOpp.owner_name}</span>}
                <span className="uppercase">{selectedOpp.priority ?? 'medium'} priority</span>
                <span>{selectedOpp.term}-term</span>
              </div>
              <div className="border-t border-green-900/20 pt-3 space-y-2">
                <p className="text-xs font-medium text-zinc-500">Change Status</p>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { value: 'open', label: 'Open' },
                    { value: 'in_progress', label: 'In Progress' },
                    { value: 'solved', label: 'Solved' },
                    { value: 'on_hold', label: 'On Hold' },
                  ].map(s => (
                    <button
                      key={s.value}
                      onClick={() => handleOppStatus(selectedOpp.id, s.value)}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                        selectedOpp.status === s.value
                          ? 'bg-green-800/40 border-green-700/50 text-green-300'
                          : 'border-green-900/30 text-zinc-400 hover:bg-green-900/20',
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-zinc-600 text-sm">Select an issue to discuss.</p>
              <p className="text-zinc-700 text-xs mt-1">Identify → Discuss → Solve</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderConclude() {
    return (
      <div className="space-y-6">
        {/* Rating */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Rate This Meeting</h3>
          <div className="flex gap-1.5">
            {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
              <button
                key={n}
                onClick={() => setRating(n)}
                className={cn(
                  'w-10 h-10 rounded-xl text-sm font-bold transition-all',
                  rating === n
                    ? n >= 8 ? 'bg-green-600 text-white ring-2 ring-green-400/30'
                      : n >= 6 ? 'bg-yellow-600 text-white ring-2 ring-yellow-400/30'
                      : 'bg-red-600 text-white ring-2 ring-red-400/30'
                    : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700',
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Todos created this meeting */}
        {meetingTodos.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">To-Dos Created This Meeting ({meetingTodos.length})</h3>
            <div className="space-y-1">
              {meetingTodos.map(t => (
                <div key={t.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-green-900/10 border border-green-900/20">
                  <span className="text-sm text-zinc-200 flex-1">{t.title}</span>
                  {t.owner_name && <span className="text-xs text-zinc-500">{t.owner_name}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Closing notes */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Closing Notes</h3>
          <textarea
            value={endNotes}
            onChange={e => setEndNotes(e.target.value)}
            className={cn(inputCls, 'w-full resize-none')}
            rows={4}
            placeholder="Key takeaways, action items, or anything to capture…"
          />
        </div>
      </div>
    );
  }

  // ═══ MAIN RENDER ═════════════════════════════════════════════════════════════

  return (
    <div className="fixed inset-0 z-50 bg-[#0d1a0f] flex flex-col overflow-hidden">
      {/* ── Top bar ── */}
      <div className="shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 border-b border-green-900/30 bg-[#0a140c]">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span className="font-serif text-base sm:text-lg font-bold text-green-200 truncate">High Bank Distillery</span>
          <span className="text-green-800 hidden sm:inline">—</span>
          <span className="text-sm text-green-500 font-medium hidden sm:inline">Level 10 Meeting</span>
        </div>
        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          <span className="text-xs sm:text-sm text-green-700 hidden md:inline">
            {new Date(meeting.started_at!).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
          <span className="font-mono text-green-300 text-base sm:text-lg tabular-nums">{fmtElapsed(elapsed)}</span>
          <button
            onClick={() => setShowEndModal(true)}
            className="px-3 py-1.5 rounded-lg bg-red-900/40 hover:bg-red-900/60 text-red-300 text-sm font-medium transition-colors border border-red-800/40"
          >
            End Meeting
          </button>
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div className="shrink-0 flex items-center justify-center gap-1 sm:gap-2 py-2.5 border-b border-green-900/20 px-4 overflow-x-auto">
        {SECTIONS.map((s, i) => (
          <button key={s.key} onClick={() => goTo(i)} className="flex items-center gap-1 sm:gap-1.5 group shrink-0" title={s.name}>
            <div className={cn(
              'w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full transition-all',
              i < currentSection ? 'bg-green-600'
                : i === currentSection ? 'bg-green-400 ring-2 ring-green-400/30 animate-pulse'
                : 'bg-zinc-700 group-hover:bg-zinc-600',
            )} />
            <span className={cn(
              'text-[11px] hidden lg:inline transition-colors whitespace-nowrap',
              i === currentSection ? 'text-green-300 font-medium' : 'text-zinc-600 group-hover:text-zinc-400',
            )}>
              {s.name}
            </span>
            {i < SECTIONS.length - 1 && <div className="w-3 sm:w-4 h-px bg-zinc-800 hidden sm:block" />}
          </button>
        ))}
      </div>

      {/* ── Section header ── */}
      <div className="shrink-0 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg sm:text-xl font-serif font-bold text-white">{section.name}</h2>
          <p className="text-xs text-green-700 mt-0.5">{section.time} min suggested</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button onClick={() => setPaused(!paused)} className="text-xs text-green-600 hover:text-green-400 transition-colors">
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <div className={cn(
            'font-mono text-xl sm:text-2xl font-bold tabular-nums',
            timerExpired ? 'text-red-400 animate-pulse' : 'text-green-300',
          )}>
            {fmtTimer(timerSeconds)}
          </div>
        </div>
      </div>

      {/* ── Section content ── */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-6">
        <div className="max-w-4xl mx-auto">
          {renderSectionContent()}

          {/* Section notes */}
          <div className="mt-6">
            <textarea
              value={notes[section.key] ?? ''}
              onChange={e => setNotes(prev => ({ ...prev, [section.key]: e.target.value }))}
              onBlur={() => handleSaveNote(section.key)}
              className={cn(inputCls, 'w-full resize-none')}
              rows={3}
              placeholder="Section notes…"
            />
          </div>
        </div>
      </div>

      {/* ── Navigation ── */}
      <div className="shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-t border-green-900/20 flex items-center justify-between">
        <button
          onClick={goPrev}
          disabled={currentSection === 0}
          className="px-4 py-2 rounded-lg border border-green-900/30 text-green-400 text-sm font-medium hover:bg-green-900/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ← Previous
        </button>
        <span className="text-xs text-zinc-600">{currentSection + 1} / {SECTIONS.length}</span>
        <button
          onClick={goNext}
          className="px-4 py-2 rounded-lg bg-green-800/40 hover:bg-green-800/60 text-green-200 text-sm font-medium transition-colors"
        >
          {currentSection === SECTIONS.length - 1 ? 'Finish Meeting →' : 'Next →'}
        </button>
      </div>

      {/* ── End Meeting Modal ── */}
      {showEndModal && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#1a1a1a] border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-5">
              <h2 className="text-lg font-semibold text-white mb-4">End Meeting</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-zinc-400 mb-2 block">Rating</label>
                  <div className="flex gap-1">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                      <button
                        key={n}
                        onClick={() => setRating(n)}
                        className={cn(
                          'w-8 h-8 rounded-lg text-xs font-bold transition-all',
                          rating === n
                            ? n >= 8 ? 'bg-green-600 text-white' : n >= 6 ? 'bg-yellow-600 text-white' : 'bg-red-600 text-white'
                            : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700',
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-400 mb-1.5 block">Notes</label>
                  <textarea
                    value={endNotes}
                    onChange={e => setEndNotes(e.target.value)}
                    className="w-full rounded-lg bg-zinc-900 border border-zinc-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-green-600 resize-none placeholder:text-zinc-600"
                    rows={3}
                    placeholder="Key takeaways…"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-5">
              <button onClick={() => setShowEndModal(false)} className="flex-1 py-2.5 rounded-lg border border-zinc-700 text-zinc-300 text-sm hover:bg-zinc-800 transition-colors">
                Cancel
              </button>
              <button onClick={handleEndMeeting} disabled={ending} className="flex-1 py-2.5 rounded-lg bg-red-800 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium transition-colors">
                {ending ? 'Ending…' : 'End Meeting'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
