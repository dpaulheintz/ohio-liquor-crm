'use client';

import { useState } from 'react';
import type { Metric, Entry } from '@/lib/eos/scorecard';
import {
  formatValue,
  formatOperator,
  formatWeekHeader,
  evaluateGoal,
  calculateAverage,
  calculateTotal,
} from '@/lib/eos/scorecard-utils';
import { saveEntry, addMetric, editMetric, removeMetric } from '@/app/eos/scorecard/actions';
import MetricModal, { type MetricFormData } from '@/components/eos/MetricModal';
import { cn } from '@/lib/utils';

type Props = {
  initialMetrics: Metric[];
  initialEntries: Entry[];
  weekStarts: string[];
  isAdmin?: boolean;
  /** If provided, shows "Flag for IDS" button on off-track rows */
  onFlagForIDS?: (title: string) => void;
  /** Set of metric titles that have already been flagged (shows "Flagged" text) */
  flaggedTitles?: Set<string>;
};

export default function ScorecardGrid({
  initialMetrics,
  initialEntries,
  weekStarts,
  isAdmin = false,
  onFlagForIDS,
  flaggedTitles = new Set(),
}: Props) {
  const currentYear = new Date().getFullYear();

  const [entryMap, setEntryMap] = useState<Map<string, string>>(() => {
    const map = new Map<string, string>();
    for (const e of initialEntries) {
      if (e.value !== null && e.value !== undefined && e.value !== '') {
        map.set(`${e.metric_id}:${e.week_start}`, e.value);
      }
    }
    return map;
  });

  const [metrics, setMetrics] = useState<Metric[]>(initialMetrics);
  const [editing, setEditing] = useState<{ metricId: string; weekStart: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [flashing, setFlashing] = useState<Set<string>>(new Set());
  const [errorCells, setErrorCells] = useState<Set<string>>(new Set());
  const [menuMetricId, setMenuMetricId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalMetric, setModalMetric] = useState<Metric | null>(null);

  function ck(metricId: string, weekStart: string) {
    return `${metricId}:${weekStart}`;
  }

  function flashKey(key: string) {
    setFlashing(prev => new Set(prev).add(key));
    setTimeout(() => setFlashing(prev => { const n = new Set(prev); n.delete(key); return n; }), 700);
  }

  function errorKey(key: string) {
    setErrorCells(prev => new Set(prev).add(key));
    setTimeout(() => setErrorCells(prev => { const n = new Set(prev); n.delete(key); return n; }), 1500);
  }

  async function handleSave(metricId: string, weekStart: string, value: string) {
    const key = ck(metricId, weekStart);
    setSaving(prev => new Set(prev).add(key));
    setEditing(null);
    try {
      await saveEntry(metricId, weekStart, value.trim());
      setEntryMap(prev => {
        const next = new Map(prev);
        const trimmed = value.trim();
        if (trimmed === '') next.delete(key);
        else next.set(key, trimmed);
        return next;
      });
      flashKey(key);
    } catch {
      errorKey(key);
    } finally {
      setSaving(prev => { const n = new Set(prev); n.delete(key); return n; });
    }
  }

  function handleCellClick(metricId: string, weekStart: string, currentValue: string | undefined) {
    setEditing({ metricId, weekStart });
    setEditValue(currentValue ?? '');
  }

  function handleBooleanClick(metricId: string, weekStart: string, currentValue: string | undefined) {
    let next: string;
    if (!currentValue || currentValue === '') next = 'true';
    else if (currentValue === 'true') next = 'false';
    else next = '';
    handleSave(metricId, weekStart, next);
  }

  function handleCellBlur() {
    if (!editing) return;
    handleSave(editing.metricId, editing.weekStart, editValue);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); handleCellBlur(); }
    if (e.key === 'Escape') setEditing(null);
  }

  async function handleDelete(metricId: string) {
    setMenuMetricId(null);
    if (!window.confirm('Delete this metric? This cannot be undone.')) return;
    try {
      await removeMetric(metricId);
      setMetrics(prev => prev.filter(m => m.id !== metricId));
    } catch {
      alert('Failed to delete metric. Please try again.');
    }
  }

  function openEditModal(metric: Metric) {
    setMenuMetricId(null);
    setModalMetric(metric);
    setShowModal(true);
  }

  async function handleModalSave(data: MetricFormData) {
    if (modalMetric) {
      await editMetric(modalMetric.id, data);
      setMetrics(prev =>
        prev.map(m =>
          m.id === modalMetric.id
            ? {
                ...m,
                title: data.title.trim(),
                goal_operator: data.goal_operator,
                goal_value: data.goal_value.trim(),
                metric_type: data.metric_type,
                owner_name: data.owner_name.trim() || null,
                owner_email: data.owner_email.trim() || null,
              }
            : m,
        ),
      );
    } else {
      const nextOrder = metrics.length > 0 ? Math.max(...metrics.map(m => m.display_order)) + 1 : 1;
      const created = await addMetric({ ...data, display_order: nextOrder });
      setMetrics(prev => [...prev, created]);
    }
    setShowModal(false);
    setModalMetric(null);
  }

  function getEntries(metricId: string) {
    return weekStarts.map(week => ({ value: entryMap.get(ck(metricId, week)) ?? null }));
  }

  const currentWeek = weekStarts[0] ?? '';
  const hasCurrentWeekData = weekStarts.length > 0 &&
    [...entryMap.keys()].some(k => k.endsWith(`:${currentWeek}`));

  const onTrackCount = metrics.filter(m => {
    const val = entryMap.get(ck(m.id, currentWeek));
    return val ? evaluateGoal(val, m.goal_operator, m.goal_value, m.metric_type) : false;
  }).length;

  // ─── Cell renderer ───────────────────────────────────────────────────────────
  function renderCell(metric: Metric, weekStart: string) {
    const key = ck(metric.id, weekStart);
    const rawValue = entryMap.get(key);
    const isEditing = editing?.metricId === metric.id && editing?.weekStart === weekStart;
    const isSaving = saving.has(key);
    const isFlashing = flashing.has(key);
    const isError = errorCells.has(key);
    const hasValue = rawValue !== undefined && rawValue !== '';
    const isGoalMet = hasValue
      ? evaluateGoal(rawValue!, metric.goal_operator, metric.goal_value, metric.metric_type)
      : false;

    const baseCellStyle = { width: 90, minWidth: 90 } as const;

    if (isEditing) {
      return (
        <td key={weekStart} className="border-b border-r border-[#3D2E1E] bg-[#2A1F14]" style={baseCellStyle}>
          <input
            autoFocus
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={handleCellBlur}
            onKeyDown={handleKeyDown}
            className="w-full py-2 px-1 bg-transparent text-[#F5ECD7] text-xs text-center focus:outline-none placeholder:text-[#6B5A4A]"
            placeholder="—"
          />
        </td>
      );
    }

    if (metric.metric_type === 'boolean') {
      return (
        <td
          key={weekStart}
          onClick={() => !isSaving && handleBooleanClick(metric.id, weekStart, rawValue)}
          className={cn(
            'text-center text-xs font-medium border-b border-r border-[#3D2E1E] py-2 select-none transition-colors duration-150',
            isSaving ? 'opacity-40 cursor-wait' : 'cursor-pointer',
            isFlashing
              ? 'bg-[#0F2E2B] text-[#5B9E94]'
              : isError
              ? 'bg-[#2E0F0F] text-[#C0392B]'
              : hasValue
              ? isGoalMet
                ? 'bg-[#0F2E2B] text-[#5B9E94] font-semibold hover:bg-[#0F2E2B]'
                : 'bg-[#2E0F0F] text-[#C0392B] font-semibold hover:bg-[#2E0F0F]'
              : 'bg-[#2A1F14] text-[#6B5A4A] hover:bg-[#2A1F14]/80',
          )}
          style={baseCellStyle}
        >
          {isSaving ? '…' : hasValue ? (rawValue === 'true' ? 'Yes' : 'No') : '—'}
        </td>
      );
    }

    return (
      <td
        key={weekStart}
        onClick={() => !isSaving && handleCellClick(metric.id, weekStart, rawValue)}
        className={cn(
          'text-center text-xs border-b border-r border-[#3D2E1E] py-2 px-1 select-none transition-colors duration-150',
          isSaving ? 'opacity-40 cursor-wait' : 'cursor-pointer',
          isFlashing
            ? 'bg-[#0F2E2B] text-[#5B9E94]'
            : isError
            ? 'bg-[#2E0F0F] text-[#C0392B]'
            : hasValue
            ? isGoalMet
              ? 'bg-[#0F2E2B] text-[#5B9E94] font-semibold hover:bg-[#0F2E2B]'
              : 'bg-[#2E0F0F] text-[#C0392B] font-semibold hover:bg-[#2E0F0F]'
            : 'bg-[#2A1F14] text-[#6B5A4A] hover:bg-[#2A1F14]/80',
        )}
        style={baseCellStyle}
      >
        {isSaving ? '…' : hasValue ? formatValue(rawValue!, metric.metric_type) : '—'}
      </td>
    );
  }

  return (
    <>
      {/* On-track summary (for runner context) */}
      {onFlagForIDS && (
        <div className="mb-4 rounded-xl bg-[#0F2E2B] border border-[#3D2E1E] px-4 py-3">
          <span className="text-sm text-[#5B9E94] font-medium">{onTrackCount} of {metrics.length} metrics on track this week</span>
          {currentWeek && <span className="text-xs text-[#8B6520] ml-2">(week of {new Date(currentWeek + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})</span>}
        </div>
      )}

      {/* Admin add button */}
      {isAdmin && (
        <div className="flex justify-end mb-3">
          <button
            onClick={() => { setModalMetric(null); setShowModal(true); }}
            className="px-4 py-2 rounded-lg bg-[#C9963A] hover:bg-[#E8B86D] text-[#0E0B07] text-sm font-medium transition-colors"
          >
            + Add Metric
          </button>
        </div>
      )}

      {/* Mobile simplified view */}
      <div className="md:hidden space-y-2 mb-4">
        {metrics.map(metric => {
          const cv = entryMap.get(ck(metric.id, currentWeek));
          const hasVal = cv !== undefined && cv !== '';
          const met = hasVal
            ? evaluateGoal(cv!, metric.goal_operator, metric.goal_value, metric.metric_type)
            : false;
          return (
            <div
              key={metric.id}
              className="rounded-xl border border-[#3D2E1E] bg-[#1C1510] px-4 py-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#F5ECD7] truncate">{metric.title}</p>
                <p className="text-xs text-[#6B5A4A] mt-0.5">
                  Goal: {formatOperator(metric.goal_operator)} {formatValue(metric.goal_value, metric.metric_type)}
                </p>
              </div>
              <div
                className={cn(
                  'shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium tabular-nums',
                  !hasVal
                    ? 'bg-[#2A1F14] text-[#6B5A4A]'
                    : met
                    ? 'bg-[#0F2E2B] text-[#5B9E94]'
                    : 'bg-[#2E0F0F] text-[#C0392B]',
                )}
              >
                {hasVal ? formatValue(cv!, metric.metric_type) : '—'}
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty state banner (desktop only, no current-week data) */}
      {!hasCurrentWeekData && currentWeek && (
        <div className="hidden md:flex items-center gap-2 mb-4 rounded-xl border border-[#3D2E1E] bg-[#2E1E08] px-4 py-3 text-sm text-[#D4821A]">
          <span className="font-medium">No data entered for {formatWeekHeader(currentWeek, currentYear)} yet.</span>
          <span className="text-[#8B6520]">Click any cell in the current-week column to start.</span>
        </div>
      )}

      {/* Desktop grid */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-[#3D2E1E]">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th
                className="sticky top-0 left-0 z-40 bg-[#0E0B07] px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[#B8A99A] border-b-2 border-r border-[#3D2E1E]"
                style={{ width: 220, minWidth: 220 }}
              >
                Metric
              </th>
              <th
                className="sticky top-0 left-[220px] z-40 bg-[#0E0B07] px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-[#B8A99A] border-b-2 border-r border-[#3D2E1E]"
                style={{ width: 110, minWidth: 110 }}
              >
                Goal
              </th>
              <th
                className="sticky top-0 left-[330px] z-40 bg-[#0E0B07] px-2 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-[#B8A99A] border-b-2 border-r border-[#3D2E1E] whitespace-nowrap"
                style={{ width: 88, minWidth: 88 }}
              >
                13-wk Avg
              </th>
              <th
                className="sticky top-0 left-[418px] z-40 bg-[#0E0B07] px-2 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-[#B8A99A] border-b-2 border-r border-[#3D2E1E] whitespace-nowrap"
                style={{ width: 88, minWidth: 88 }}
              >
                13-wk Total
              </th>
              {weekStarts.map((week, i) => (
                <th
                  key={week}
                  className={cn(
                    'sticky top-0 z-30 px-1 py-2.5 text-center text-[11px] font-semibold border-b-2 border-r border-[#3D2E1E] whitespace-nowrap',
                    i === 0
                      ? 'bg-[#2A1F14] text-[#C9963A]'
                      : 'bg-[#0E0B07] text-[#B8A99A]',
                  )}
                  style={{ width: 90, minWidth: 90 }}
                >
                  <span className="block">{formatWeekHeader(week, currentYear)}</span>
                  {i === 0 && (
                    <span className="block text-[9px] font-normal text-[#8B6520] mt-0.5 uppercase tracking-wide">
                      current
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric, rowIdx) => {
              const rowBg = rowIdx % 2 === 0 ? '#111111' : '#141414';
              const entries = getEntries(metric.id);
              const avgStr = calculateAverage(entries, metric.metric_type);
              const totalStr = calculateTotal(entries, metric.metric_type);
              const currentVal = entryMap.get(ck(metric.id, currentWeek));
              const isOffTrack = currentVal
                ? !evaluateGoal(currentVal, metric.goal_operator, metric.goal_value, metric.metric_type)
                : false;
              const flagTitle = `Scorecard: ${metric.title}`;

              return (
                <tr key={metric.id} className="group/row">
                  {/* Title — frozen */}
                  <td
                    className="sticky left-0 border-b border-r border-[#3D2E1E] px-3 py-2"
                    style={{
                      width: 220,
                      minWidth: 220,
                      background: rowBg,
                      zIndex: menuMetricId === metric.id ? 50 : 10,
                    }}
                  >
                    <div className="flex items-center gap-1 relative">
                      <span
                        className="flex-1 text-sm font-medium text-[#F5ECD7] truncate"
                        title={metric.title}
                      >
                        {metric.title}
                      </span>
                      {/* Flag for IDS (runner context) */}
                      {onFlagForIDS && isOffTrack && !flaggedTitles.has(flagTitle) && (
                        <button
                          onClick={() => onFlagForIDS(flagTitle)}
                          className="opacity-0 group-hover/row:opacity-100 text-[11px] text-[#8B6520] hover:text-[#D4821A] transition-all whitespace-nowrap shrink-0"
                        >
                          Flag
                        </button>
                      )}
                      {onFlagForIDS && flaggedTitles.has(flagTitle) && (
                        <span className="text-[11px] text-[#8B6520] shrink-0">Flagged</span>
                      )}
                      {/* Admin context menu */}
                      {isAdmin && (
                        <div data-menu className="relative shrink-0">
                          <button
                            data-menu
                            onClick={e => {
                              e.stopPropagation();
                              setMenuMetricId(menuMetricId === metric.id ? null : metric.id);
                            }}
                            className="opacity-0 group-hover/row:opacity-100 text-[#6B5A4A] hover:text-[#F5ECD7] px-1 py-0.5 rounded transition-all text-base leading-none"
                            title="Options"
                          >
                            ···
                          </button>
                          {menuMetricId === metric.id && (
                            <div
                              data-menu
                              className="absolute right-0 top-full mt-1 bg-[#2A1F14] border border-[#3D2E1E] rounded-xl shadow-2xl overflow-hidden w-28 z-50"
                            >
                              <button
                                onClick={() => openEditModal(metric)}
                                className="w-full px-4 py-2.5 text-left text-sm text-[#F5ECD7] hover:bg-[#3D2E1E] transition-colors"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(metric.id)}
                                className="w-full px-4 py-2.5 text-left text-sm text-[#C0392B] hover:bg-[#3D2E1E] transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Goal — frozen */}
                  <td
                    className="sticky left-[220px] z-10 border-b border-r border-[#3D2E1E] px-3 py-2"
                    style={{ width: 110, minWidth: 110, background: rowBg }}
                  >
                    <span className="text-xs text-[#B8A99A] whitespace-nowrap tabular-nums">
                      {formatOperator(metric.goal_operator)}{' '}
                      {formatValue(metric.goal_value, metric.metric_type)}
                    </span>
                  </td>

                  {/* Avg — frozen */}
                  <td
                    className="sticky left-[330px] z-10 border-b border-r border-[#3D2E1E] px-2 py-2 text-center"
                    style={{ width: 88, minWidth: 88, background: rowBg }}
                  >
                    <span className="text-xs text-[#F5ECD7] tabular-nums">{avgStr}</span>
                  </td>

                  {/* Total — frozen */}
                  <td
                    className="sticky left-[418px] z-10 border-b border-r border-[#3D2E1E] px-2 py-2 text-center"
                    style={{ width: 88, minWidth: 88, background: rowBg }}
                  >
                    <span className="text-xs text-[#F5ECD7] tabular-nums">{totalStr}</span>
                  </td>

                  {/* Week cells */}
                  {weekStarts.map(weekStart => renderCell(metric, weekStart))}
                </tr>
              );
            })}

            {metrics.length === 0 && (
              <tr>
                <td
                  colSpan={4 + weekStarts.length}
                  className="px-6 py-16 text-center text-[#6B5A4A] text-sm"
                >
                  No metrics yet. Click &ldquo;+ Add Metric&rdquo; to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <MetricModal
          mode={modalMetric ? 'edit' : 'create'}
          metric={modalMetric ?? undefined}
          onSave={handleModalSave}
          onClose={() => { setShowModal(false); setModalMetric(null); }}
        />
      )}
    </>
  );
}
