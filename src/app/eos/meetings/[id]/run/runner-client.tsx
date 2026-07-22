'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { Meeting, MeetingNote } from '@/lib/eos/meetings';
import type { Metric, Entry } from '@/lib/eos/scorecard';
import type { BarrelWithMilestones } from '@/lib/eos/barrels';
import type { Todo } from '@/lib/eos/todos';
import type { Opportunity } from '@/lib/eos/opportunities';
import type { Headline } from '@/lib/eos/headlines';
import { EOS_TEAM_MEMBERS } from '@/lib/eos/team';
import ScorecardGrid from '@/components/eos/ScorecardGrid';
import BarrelsListView from '@/components/eos/BarrelsListView';
import SmartAddButton from '@/components/eos/SmartAddButton';
import {
  saveSectionNoteAction,
  endMeetingAction,
  createMeetingTodoAction,
  carryForwardTodoAction,
  flagForIDSAction,
  updateBarrelStatusInMeetingAction,
  addHeadlineInMeetingAction,
  upsertPersonRatingAction,
  createOpportunityInMeetingAction,
} from '@/app/eos/meetings/actions';
import { toggleTodoAction } from '@/app/eos/todos/actions';
import { updateOpportunityStatusAction } from '@/app/eos/opportunities/actions';
import { cn } from '@/lib/utils';

const SECTIONS = [
  { key: 'segue',     name: 'Segue',                time: 5  },
  { key: 'scorecard', name: 'Scorecard Review',     time: 5  },
  { key: 'barrels',   name: 'Barrel Review',        time: 5  },
  { key: 'headlines', name: 'Headlines',            time: 5  },
  { key: 'todos',     name: 'To-Do Review',         time: 5  },
  { key: 'ids',       name: 'IDS — Opportunities',  time: 60 },
  { key: 'conclude',  name: 'Conclude',             time: 5  },
];

const HEADLINE_TYPES: Record<string, { label: string; dot: string }> = {
  good_news:       { label: 'Good News',      dot: 'bg-amber-500' },
  customer_win:    { label: 'Customer Win',   dot: 'bg-green-600' },
  employee_update: { label: 'Team Update',    dot: 'bg-green-600' },
};

const PRIORITY_DOT: Record<string, string> = {
  critical: 'bg-red-600', high: 'bg-red-600', medium: 'bg-amber-500', low: 'bg-gray-300',
};

const SECTION_MAP: Record<string, number> = {
  segue: 0, scorecard: 1, barrels: 2, headlines: 3, todos: 4, ids: 5, conclude: 6,
};

type Props = {
  meeting: Meeting;
  initialNotes: MeetingNote[];
  metrics: Metric[];
  entries: Entry[];
  weekStarts: string[];
  barrels: BarrelWithMilestones[];
  todos: Todo[];
  opportunities: Opportunity[];
  headlines: Headline[];
  initialSection?: string;
  initialOpportunityId?: string;
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
  weekStarts,
  barrels: initialBarrels,
  todos: initialTodos,
  opportunities: initialOpportunities,
  headlines: initialHeadlines,
  initialSection,
  initialOpportunityId,
}: Props) {
  const router = useRouter();

  // ── Navigation ──
  const [currentSection, setCurrentSection] = useState(() =>
    initialSection ? (SECTION_MAP[initialSection] ?? 0) : 0,
  );

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

  // Re-sync local copies whenever the server gives us fresh props. This is the
  // path items created via SmartAddButton take: its modals call a *different*
  // server action than the runner's own inline forms, then router.refresh() —
  // which re-fetches this page's server data and passes new props down, but a
  // useState(initial…) only reads its argument once at mount, so without this
  // effect the runner's local lists would silently stay stale after a refresh.
  useEffect(() => { setBarrels(initialBarrels); }, [initialBarrels]);
  useEffect(() => { setTodos(initialTodos); }, [initialTodos]);
  useEffect(() => { setOpportunities(initialOpportunities); }, [initialOpportunities]);
  useEffect(() => { setHeadlines(initialHeadlines); }, [initialHeadlines]);

  // ── UI state ──
  const [sharedHeadlines, setSharedHeadlines] = useState<Set<string>>(new Set());
  const [readHeadlines, setReadHeadlines] = useState<Set<string>>(new Set());
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [selectedOppId, setSelectedOppId] = useState<string | null>(initialOpportunityId ?? null);
  const [showEndModal, setShowEndModal] = useState(false);
  const [endNotes, setEndNotes] = useState('');
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);

  // ── Per-person ratings ──
  const [personRatings, setPersonRatings] = useState<Record<string, number>>({});

  // ── Inline forms ──
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [newTodoOwner, setNewTodoOwner] = useState('');
  const [newTodoDue, setNewTodoDue] = useState('');
  const [newHeadlineTitle, setNewHeadlineTitle] = useState('');
  const [newHeadlineType, setNewHeadlineType] = useState('good_news');

  // ── IDS inline add opportunity ──
  const [showAddOpp, setShowAddOpp] = useState(false);
  const [newOppTitle, setNewOppTitle] = useState('');
  const [newOppTerm, setNewOppTerm] = useState<'short' | 'long'>('short');
  const [newOppPriority, setNewOppPriority] = useState('medium');
  const [newOppOwner, setNewOppOwner] = useState('');
  const [newOppOwnerEmail, setNewOppOwnerEmail] = useState('');
  const [addingOpp, setAddingOpp] = useState(false);

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

  // ── Rating summary ──
  const ratedCount = Object.keys(personRatings).length;
  const avgRating = ratedCount > 0
    ? Math.round((Object.values(personRatings).reduce((a, b) => a + b, 0) / ratedCount) * 10) / 10
    : null;

  // ── Handlers ──
  function goTo(i: number) { if (i >= 0 && i < SECTIONS.length) { setCurrentSection(i); setPaused(false); } }
  function goNext() { currentSection === SECTIONS.length - 1 ? setShowEndModal(true) : goTo(currentSection + 1); }
  function goPrev() { goTo(currentSection - 1); }

  async function handleSaveNote(key: string) {
    try { await saveSectionNoteAction(meeting.id, key, notes[key] ?? ''); } catch { /* best effort */ }
  }

  async function handleEndMeeting() {
    setEnding(true);
    setEndError(null);
    try {
      await endMeetingAction(meeting.id, endNotes);
      router.push(`/eos/meetings/${meeting.id}`);
    } catch (error) {
      console.error('Failed to end meeting:', error);
      setEndError(
        error instanceof Error && error.message
          ? `Failed to end meeting: ${error.message}`
          : 'Failed to end meeting. Please try again.',
      );
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
    } catch { console.error('Failed to create to-do.'); }
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
    } catch { console.error('Failed to add headline.'); }
  }

  async function handleOppStatus(id: string, status: string) {
    setOpportunities(prev => prev.map(o => o.id === id ? { ...o, status: status as Opportunity['status'] } : o));
    try { await updateOpportunityStatusAction(id, status); } catch { /* best effort */ }
  }

  async function handlePersonRating(email: string, name: string, rating: number) {
    setPersonRatings(prev => ({ ...prev, [email]: rating }));
    try { await upsertPersonRatingAction(meeting.id, name, email, rating); } catch { /* best effort */ }
  }

  async function handleAddOpportunity() {
    if (!newOppTitle.trim()) return;
    setAddingOpp(true);
    try {
      const opp = await createOpportunityInMeetingAction({
        title: newOppTitle,
        term: newOppTerm,
        priority: newOppPriority,
        owner_name: newOppOwner,
        owner_email: newOppOwnerEmail,
      });
      setOpportunities(prev => [opp, ...prev]);
      setSelectedOppId(opp.id);
      setNewOppTitle(''); setNewOppOwner(''); setNewOppOwnerEmail('');
      setShowAddOpp(false);
    } catch { console.error('Failed to add opportunity.'); }
    finally { setAddingOpp(false); }
  }

  // ── Input styles ──
  const inputCls = 'rounded-lg bg-white border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-green-600 placeholder:text-gray-400 transition-colors';

  // ═══ SECTION RENDERERS ═══════════════════════════════════════════════════════

  function renderSectionContent() {
    switch (section.key) {
      case 'segue':     return renderSegue();
      case 'scorecard': return renderScorecard();
      case 'barrels':   return renderBarrels();
      case 'headlines': return renderHeadlines();
      case 'todos':     return renderTodos();
      case 'ids':       return renderIDS();
      case 'conclude':  return renderConclude();
      default: return null;
    }
  }

  function renderSegue() {
    return (
      <div className="space-y-6">
        <div className="rounded-xl bg-green-50 border border-gray-200 p-5">
          <p className="text-green-600 text-sm leading-relaxed">
            Each person shares one <strong>personal win</strong> and one <strong>professional win</strong> from the past week.
          </p>
        </div>
        {headlines.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Today&apos;s Headlines</h3>
            {Object.entries(HEADLINE_TYPES).map(([type, cfg]) => {
              const items = headlines.filter(h => h.headline_type === type);
              if (items.length === 0) return null;
              return (
                <div key={type} className="mb-3">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <div className={cn('w-2 h-2 rounded-full', cfg.dot)} />
                    <span className="text-xs text-gray-500 font-medium">{cfg.label}</span>
                  </div>
                  {items.map(h => (
                    <label key={h.id} className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg hover:bg-green-50 cursor-pointer transition-colors">
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
                      <span className={cn('text-sm', sharedHeadlines.has(h.id) ? 'text-gray-500 line-through' : 'text-gray-900')}>
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
      <div className="overflow-x-auto">
        <ScorecardGrid
          initialMetrics={metrics}
          initialEntries={entries}
          weekStarts={weekStarts}
          isAdmin={false}
          onFlagForIDS={handleFlagForIDS}
          flaggedTitles={flagged}
        />
      </div>
    );
  }

  function renderBarrels() {
    return (
      <BarrelsListView
        barrels={barrels}
        onStatusChange={handleBarrelStatus}
        onFlagForIDS={handleFlagForIDS}
        flaggedTitles={flagged}
      />
    );
  }

  function renderHeadlines() {
    return (
      <div className="space-y-5">
        {showAllHeadlines && headlines.length > 0 && (
          <div className="rounded-xl bg-amber-50 border border-gray-200 px-4 py-2.5 text-sm text-amber-600">
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
                <span className="text-xs font-medium text-gray-500">{cfg.label}</span>
              </div>
              {items.map(h => (
                <label key={h.id} className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg hover:bg-green-50 cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={readHeadlines.has(h.id)}
                    onChange={() => setReadHeadlines(prev => { const n = new Set(prev); n.has(h.id) ? n.delete(h.id) : n.add(h.id); return n; })}
                    className="accent-green-600"
                  />
                  <span className={cn('text-sm flex-1', readHeadlines.has(h.id) ? 'text-gray-400 line-through' : 'text-gray-900')}>{h.title}</span>
                  {h.owner_name && <span className="text-xs text-gray-400">{h.owner_name}</span>}
                </label>
              ))}
            </div>
          );
        })}

        {headlines.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No headlines yet.</p>}

        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-xs font-medium text-gray-500 mb-2">Quick Add Headline</h4>
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
            <button onClick={handleAddHeadline} className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-100 text-green-600 text-sm font-medium transition-colors shrink-0">
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
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Last Week&apos;s To-Dos</h3>
          {lastWeekTodos.length === 0 ? (
            <p className="text-sm text-gray-400 py-2">No to-dos from the past week.</p>
          ) : (
            <div className="space-y-1">
              {lastWeekTodos.map(t => (
                <div key={t.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-green-50 transition-colors">
                  <button
                    onClick={() => handleToggleTodo(t.id, !t.completed)}
                    className={cn('w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                      t.completed ? 'bg-green-600 border-green-600' : 'border-gray-200 hover:border-green-600')}
                  >
                    {t.completed && <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none"><path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                  </button>
                  <span className={cn('flex-1 text-sm', t.completed ? 'line-through text-gray-400' : 'text-gray-900')}>{t.title}</span>
                  {t.owner_name && <span className="text-xs text-gray-400 shrink-0">{t.owner_name}</span>}
                  {!t.completed && t.due_date && t.due_date < todayStr && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-medium shrink-0">Overdue</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {overdueTodos.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Carry Forward</h3>
            <div className="space-y-1">
              {overdueTodos.map(t => (
                <div key={t.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-red-50 border border-gray-200">
                  <span className="flex-1 text-sm text-gray-900">{t.title}</span>
                  {t.owner_name && <span className="text-xs text-gray-400 shrink-0">{t.owner_name}</span>}
                  <span className="text-xs text-red-600 shrink-0">{fmtShortDate(t.due_date)}</span>
                  <button
                    onClick={() => handleCarryForward(t.id)}
                    className="text-[11px] px-2 py-1 rounded bg-gray-100 hover:bg-gray-100 text-green-600 font-medium transition-colors shrink-0"
                  >
                    Carry Forward +7d
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-xs font-medium text-gray-500 mb-2">Create New To-Do</h4>
          <div className="flex gap-2 items-end flex-wrap">
            <input
              type="text"
              value={newTodoTitle}
              onChange={e => setNewTodoTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateTodo()}
              className={cn(inputCls, 'flex-1 min-w-[200px]')}
              placeholder="Task…"
            />
            <select
              value={newTodoOwner}
              onChange={e => setNewTodoOwner(e.target.value)}
              className={cn(inputCls, 'w-36')}
            >
              <option value="">— Owner —</option>
              {EOS_TEAM_MEMBERS.map(m => (
                <option key={m.email} value={m.name}>{m.name}</option>
              ))}
            </select>
            <input
              type="date"
              value={newTodoDue}
              onChange={e => setNewTodoDue(e.target.value)}
              className={cn(inputCls, 'w-36')}
            />
            <button onClick={handleCreateTodo} className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-100 text-green-600 text-sm font-medium transition-colors shrink-0">
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
          {/* ── Add Opportunity form ── */}
          {showAddOpp ? (
            <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4 space-y-3">
              <h4 className="text-sm font-semibold text-gray-900">New Opportunity</h4>
              <input
                autoFocus
                type="text"
                value={newOppTitle}
                onChange={e => setNewOppTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddOpportunity()}
                className={cn(inputCls, 'w-full')}
                placeholder="What's the issue or opportunity?"
              />
              <div className="flex gap-2 flex-wrap">
                <div className="flex rounded-lg overflow-hidden border border-gray-200">
                  {(['short', 'long'] as const).map(t => (
                    <button key={t} type="button" onClick={() => setNewOppTerm(t)}
                      className={cn('px-3 py-1.5 text-sm font-medium capitalize transition-colors',
                        newOppTerm === t ? 'bg-green-600 text-white' : 'text-gray-500 hover:text-gray-900')}>
                      {t}-term
                    </button>
                  ))}
                </div>
                <select value={newOppPriority} onChange={e => setNewOppPriority(e.target.value)} className={cn(inputCls, 'py-1.5')}>
                  <option value="">— Priority —</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
                <select
                  value={newOppOwner}
                  onChange={e => {
                    const m = EOS_TEAM_MEMBERS.find(m => m.name === e.target.value);
                    setNewOppOwner(e.target.value);
                    setNewOppOwnerEmail(m?.email ?? '');
                  }}
                  className={cn(inputCls, 'py-1.5')}
                >
                  <option value="">— Owner —</option>
                  {EOS_TEAM_MEMBERS.map(m => <option key={m.email} value={m.name}>{m.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowAddOpp(false)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 text-sm hover:bg-green-50 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={handleAddOpportunity}
                  disabled={addingOpp || !newOppTitle.trim()}
                  className="flex-1 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium transition-colors"
                >
                  {addingOpp ? 'Adding…' : 'Add Opportunity'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddOpp(true)}
              className="w-full mb-4 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-gray-200 text-green-600 hover:border-green-600/60 hover:text-green-600 hover:bg-green-50 transition-all text-sm font-medium"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
                <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              Add Opportunity
            </button>
          )}

          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
            Open Issues ({openOpps.length})
          </h3>
          <div className="space-y-1 max-h-[45vh] overflow-y-auto">
            {openOpps.map(opp => {
              const dot = PRIORITY_DOT[opp.priority ?? ''] ?? 'bg-gray-300';
              return (
                <button
                  key={opp.id}
                  onClick={() => setSelectedOppId(opp.id === selectedOppId ? null : opp.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-left transition-colors',
                    selectedOppId === opp.id ? 'bg-green-50 ring-1 ring-green-600/50' : 'hover:bg-green-50',
                  )}
                >
                  <div className={cn('w-2 h-2 rounded-full shrink-0', dot)} />
                  <span className="flex-1 text-sm text-gray-900 min-w-0 truncate">{opp.title}</span>
                  <span className="text-[10px] uppercase tracking-wider text-gray-400 shrink-0">{opp.term}-term</span>
                </button>
              );
            })}
            {openOpps.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No open issues.</p>}
          </div>

          {/* Quick add todo from IDS */}
          <div className="mt-4 border-t border-gray-200 pt-4">
            <h4 className="text-xs font-medium text-gray-500 mb-2">Create To-Do from Discussion</h4>
            <div className="flex gap-2 items-end">
              <input
                type="text"
                value={newTodoTitle}
                onChange={e => setNewTodoTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateTodo()}
                className={cn(inputCls, 'flex-1')}
                placeholder="Action item…"
              />
              <select value={newTodoOwner} onChange={e => setNewTodoOwner(e.target.value)} className={cn(inputCls, 'w-36')}>
                <option value="">— Owner —</option>
                {EOS_TEAM_MEMBERS.map(m => (
                  <option key={m.email} value={m.name}>{m.name}</option>
                ))}
              </select>
              <button onClick={handleCreateTodo} className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-100 text-green-600 text-sm font-medium transition-colors shrink-0">+ Add</button>
            </div>
          </div>
        </div>

        {/* Right: Discussion panel */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          {selectedOpp ? (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-gray-900">{selectedOpp.title}</h3>
              {selectedOpp.description && <p className="text-sm text-gray-500 leading-relaxed">{selectedOpp.description}</p>}
              <div className="flex items-center gap-3 text-xs text-gray-500">
                {selectedOpp.owner_name && <span>{selectedOpp.owner_name}</span>}
                <span className="uppercase">{selectedOpp.priority ?? 'medium'} priority</span>
                <span>{selectedOpp.term}-term</span>
              </div>
              <div className="border-t border-gray-200 pt-3 space-y-2">
                <p className="text-xs font-medium text-gray-500">Change Status</p>
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
                          ? 'bg-green-600 border-green-600 text-white'
                          : 'border-gray-200 text-gray-500 hover:bg-gray-100',
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
              <p className="text-gray-400 text-sm">Select an issue to discuss.</p>
              <p className="text-gray-400 text-xs mt-1">Identify → Discuss → Solve</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderConclude() {
    return (
      <div className="space-y-6">
        {/* Per-person ratings */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Rate This Meeting</h3>
          <p className="text-xs text-gray-500 mb-4">Enter each attendee&apos;s rating.</p>
          <div className="space-y-3">
            {EOS_TEAM_MEMBERS.map(member => {
              const selected = personRatings[member.email];
              return (
                <div key={member.email} className="flex items-center gap-3">
                  {/* Avatar */}
                  <div className="shrink-0 w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-[11px] font-bold text-white">
                    {member.initials}
                  </div>
                  {/* Name */}
                  <span className="w-32 shrink-0 text-sm text-gray-900 truncate">{member.name}</span>
                  {/* Rating pills */}
                  <div className="flex gap-1 flex-wrap">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                      <button
                        key={n}
                        onClick={() => handlePersonRating(member.email, member.name, n)}
                        className={cn(
                          'w-8 h-8 rounded-lg text-xs font-bold transition-all',
                          selected === n
                            ? 'bg-green-600 text-white font-bold ring-2 ring-green-600/30'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-100 hover:text-gray-900',
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Live summary */}
          <div className="mt-4 px-4 py-3 rounded-xl bg-green-50 border border-gray-200">
            {avgRating !== null ? (
              <span className="text-sm text-green-600 font-medium">
                Average: {avgRating} / 10
                <span className="text-green-700 font-normal ml-2">({ratedCount} of {EOS_TEAM_MEMBERS.length} rated)</span>
              </span>
            ) : (
              <span className="text-sm text-gray-400">No ratings entered yet.</span>
            )}
          </div>
        </div>

        {/* Todos created this meeting */}
        {meetingTodos.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">To-Dos Created This Meeting ({meetingTodos.length})</h3>
            <div className="space-y-1">
              {meetingTodos.map(t => (
                <div key={t.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-green-50 border border-gray-200">
                  <span className="text-sm text-gray-900 flex-1">{t.title}</span>
                  {t.owner_name && <span className="text-xs text-gray-500">{t.owner_name}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Closing notes */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">What would have made it a 10?</h3>
          <textarea
            value={endNotes}
            onChange={e => setEndNotes(e.target.value)}
            className={cn(inputCls, 'w-full resize-none')}
            rows={4}
            placeholder="Key takeaways, action items, or anything to capture…"
          />
        </div>

        {/* End meeting button */}
        <button
          onClick={() => setShowEndModal(true)}
          className="w-full py-3 rounded-xl text-sm font-bold transition-colors bg-green-600 hover:bg-green-700 text-white"
        >
          End Meeting &amp; Save
        </button>
      </div>
    );
  }

  // ═══ MAIN RENDER ═════════════════════════════════════════════════════════════

  return (
    <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col overflow-hidden">
      {/* ── Top bar ── */}
      <div className="shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span className="font-serif text-base sm:text-lg font-bold text-gray-900 truncate" style={{ letterSpacing: '-0.01em' }}>High Bank Distillery</span>
          <span className="text-green-700 hidden sm:inline">—</span>
          <span className="text-sm text-green-600 font-medium hidden sm:inline">Level 10 Meeting</span>
        </div>
        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          <span className="text-xs sm:text-sm text-green-700 hidden md:inline">
            {new Date(meeting.started_at!).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
          <span className="font-mono text-green-600 text-base sm:text-lg tabular-nums">{fmtElapsed(elapsed)}</span>
          <button
            onClick={() => setShowEndModal(true)}
            className="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-50 text-red-600 text-sm font-medium transition-colors border border-gray-200"
          >
            End Meeting
          </button>
        </div>
      </div>

      {/* ── Progress bar ── */}
      <div className="shrink-0 flex items-center justify-center gap-1 sm:gap-2 py-2.5 border-b border-gray-200 px-4 overflow-x-auto">
        {SECTIONS.map((s, i) => (
          <button key={s.key} onClick={() => goTo(i)} className="flex items-center gap-1 sm:gap-1.5 group shrink-0" title={s.name}>
            <div className={cn(
              'w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full transition-all',
              i < currentSection ? 'bg-green-600'
                : i === currentSection ? 'bg-green-600 ring-2 ring-green-600/30 animate-pulse'
                : 'bg-gray-200 group-hover:bg-gray-300',
            )} />
            <span className={cn(
              'text-[11px] hidden lg:inline transition-colors whitespace-nowrap',
              i === currentSection ? 'text-green-600 font-medium' : 'text-gray-400 group-hover:text-gray-500',
            )}>
              {s.name}
            </span>
            {i < SECTIONS.length - 1 && <div className="w-3 sm:w-4 h-px bg-gray-100 hidden sm:block" />}
          </button>
        ))}
      </div>

      {/* ── Section header ── */}
      <div className="shrink-0 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg sm:text-xl font-serif font-bold text-gray-900">{section.name}</h2>
          <p className="text-xs text-green-700 mt-0.5">{section.time} min suggested</p>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <button onClick={() => setPaused(!paused)} className="text-xs text-green-600 hover:text-green-700 transition-colors">
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <div className={cn(
            'font-mono text-xl sm:text-2xl font-bold tabular-nums',
            timerExpired ? 'text-red-600 animate-pulse' : 'text-green-600',
          )}>
            {fmtTimer(timerSeconds)}
          </div>
        </div>
      </div>

      {/* ── Section content ── */}
      {/* Scorecard gets the full content width — its 13-week grid (~1700px)
          was being squeezed into the 896px prose column below, so almost
          the whole table sat behind a horizontal scrollbar. Every other
          section is prose/forms and stays narrow for readability. */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-6">
        <div className={section.key === 'scorecard' ? 'w-full' : 'max-w-4xl mx-auto'}>
          {renderSectionContent()}

          {/* Section notes */}
          <div className={cn('mt-6', section.key === 'scorecard' && 'max-w-4xl mx-auto')}>
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

      {/* ── Navigation (centered) ── */}
      <div className="shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 flex items-center justify-center gap-6">
        <button
          onClick={goPrev}
          disabled={currentSection === 0}
          className="px-4 py-2 rounded-lg border border-gray-200 text-gray-500 text-sm font-medium hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          ← Previous
        </button>
        <span className="text-xs text-gray-400">{currentSection + 1} / {SECTIONS.length}</span>
        <button
          onClick={goNext}
          className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors"
        >
          {currentSection === SECTIONS.length - 1 ? 'Finish →' : 'Next →'}
        </button>
      </div>

      {/* ── SmartAddButton (above runner at z-[55]) ── */}
      <SmartAddButton pageContext="meeting" className="z-[55]" />

      {/* ── End Meeting Modal ── */}
      {showEndModal && (
        <div className="fixed inset-0 z-[60] bg-gray-50/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-5">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">End Meeting</h2>
              {avgRating !== null && (
                <p className="text-sm text-gray-500 mb-4">
                  Meeting rating: <span className="font-semibold text-green-600">{avgRating}/10</span>
                  <span className="text-gray-400 ml-1">({ratedCount} rated)</span>
                </p>
              )}
              <p className="text-sm text-gray-500">This will save all notes and ratings, then close the meeting.</p>
              {endError && (
                <p className="mt-3 text-sm text-red-600 font-medium">{endError}</p>
              )}
            </div>
            <div className="flex gap-3 px-6 pb-5">
              <button onClick={() => { setShowEndModal(false); setEndError(null); }} className="flex-1 py-2.5 rounded-lg border border-gray-200 text-gray-900 text-sm hover:bg-gray-100 transition-colors">
                Cancel
              </button>
              <button onClick={handleEndMeeting} disabled={ending} className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium transition-colors">
                {ending ? 'Ending…' : 'End Meeting'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
