'use client';

import { Fragment, useState } from 'react';
import type { Metric, Entry } from '@/lib/eos/scorecard';
import {
  formatValue,
  formatOperator,
  formatWeekHeader,
  evaluateGoal,
  calculateAverage,
  calculateTotal,
} from '@/lib/eos/scorecard-utils';
import { saveEntry, addMetric, editMetric, removeMetric, reorderMetricsAction } from '@/app/eos/scorecard/actions';
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
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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

  function requestDelete(metricId: string) {
    setMenuMetricId(null);
    setConfirmingDeleteId(metricId);
  }

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(prev => (prev === message ? null : prev)), 2500);
  }

  async function handleConfirmDelete(metricId: string) {
    setDeletingId(metricId);
    try {
      await removeMetric(metricId); // soft delete (active = false)
      setMetrics(prev => prev.filter(m => m.id !== metricId));
      setConfirmingDeleteId(null);
      showToast('Metric deleted');
    } catch {
      console.error('Failed to delete metric.');
      showToast('Failed to delete metric');
    } finally {
      setDeletingId(null);
    }
  }

  function openEditModal(metric: Metric) {
    setMenuMetricId(null);
    setModalMetric(metric);
    setShowModal(true);
  }

  // Move a metric up/down one position and persist the new order. Optimistic:
  // the UI reorders immediately and reverts if the save fails.
  async function handleMove(metricId: string, dir: -1 | 1) {
    setMenuMetricId(null);
    const idx = metrics.findIndex(m => m.id === metricId);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= metrics.length) return;
    const prev = metrics;
    const next = [...metrics];
    [next[idx], next[target]] = [next[target], next[idx]];
    setMetrics(next.map((m, i) => ({ ...m, display_order: i + 1 })));
    try {
      await reorderMetricsAction(next.map(m => m.id));
    } catch {
      setMetrics(prev);
      showToast('Failed to reorder');
    }
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
        <td key={weekStart} className="border-b border-r border-gray-200 bg-gray-100" style={baseCellStyle}>
          <input
            autoFocus
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={handleCellBlur}
            onKeyDown={handleKeyDown}
            className="w-full py-2 px-1 bg-transparent text-gray-900 text-xs text-center focus:outline-none placeholder:text-gray-400"
            placeholder="—"
          />
        </td>
      );
    }

    const cellColor = isFlashing
      ? '#16A34A'
      : isError
      ? '#DC2626'
      : hasValue
      ? isGoalMet ? '#16A34A' : '#DC2626'
      : '#9CA3AF';

    if (metric.metric_type === 'boolean') {
      return (
        <td
          key={weekStart}
          onClick={() => !isSaving && handleBooleanClick(metric.id, weekStart, rawValue)}
          className={cn(
            'text-center text-xs font-medium border-b border-r border-gray-200 bg-white py-2 select-none transition-colors duration-150 hover:bg-gray-50',
            isSaving ? 'opacity-40 cursor-wait' : 'cursor-pointer',
            hasValue && 'font-semibold',
          )}
          style={{ ...baseCellStyle, color: cellColor }}
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
          'text-center text-xs border-b border-r border-gray-200 bg-white py-2 px-1 select-none transition-colors duration-150 hover:bg-gray-50',
          isSaving ? 'opacity-40 cursor-wait' : 'cursor-pointer',
          hasValue && 'font-semibold',
        )}
        style={{ ...baseCellStyle, color: cellColor }}
      >
        {isSaving ? '…' : hasValue ? formatValue(rawValue!, metric.metric_type) : '—'}
      </td>
    );
  }

  return (
    <>
      {/* On-track summary (for runner context) */}
      {onFlagForIDS && (
        <div className="mb-4 rounded-xl bg-green-50 border border-gray-200 px-4 py-3">
          <span className="text-sm text-green-600 font-medium">{onTrackCount} of {metrics.length} metrics on track this week</span>
          {currentWeek && <span className="text-xs text-green-700 ml-2">(week of {new Date(currentWeek + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})</span>}
        </div>
      )}

      {/* Admin add button */}
      {isAdmin && (
        <div className="flex justify-end mb-3">
          <button
            onClick={() => { setModalMetric(null); setShowModal(true); }}
            className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
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
              className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{metric.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Goal: {formatOperator(metric.goal_operator)} {formatValue(metric.goal_value, metric.metric_type)}
                </p>
              </div>
              <div
                className={cn(
                  'shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium tabular-nums',
                  !hasVal
                    ? 'bg-gray-100 text-gray-400'
                    : met
                    ? 'bg-green-50 text-green-600'
                    : 'bg-red-50 text-red-600',
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
        <div className="hidden md:flex items-center gap-2 mb-4 rounded-xl border border-gray-200 bg-amber-50 px-4 py-3 text-sm text-amber-600">
          <span className="font-medium">No data entered for {formatWeekHeader(currentWeek, currentYear)} yet.</span>
          <span className="text-green-700">Click any cell in the current-week column to start.</span>
        </div>
      )}

      {/* Desktop grid */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th
                className="sticky top-0 left-0 z-40 bg-gray-50 px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 border-b-2 border-r border-gray-200"
                style={{ width: 220, minWidth: 220 }}
              >
                Metric
              </th>
              <th
                className="sticky top-0 left-[220px] z-40 bg-gray-50 px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 border-b-2 border-r border-gray-200"
                style={{ width: 110, minWidth: 110 }}
              >
                Goal
              </th>
              <th
                className="sticky top-0 left-[330px] z-40 bg-gray-50 px-2 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-gray-500 border-b-2 border-r border-gray-200 whitespace-nowrap"
                style={{ width: 88, minWidth: 88 }}
              >
                13-wk Avg
              </th>
              <th
                className="sticky top-0 left-[418px] z-40 bg-gray-50 px-2 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-gray-500 border-b-2 border-r border-gray-200 whitespace-nowrap"
                style={{ width: 88, minWidth: 88 }}
              >
                13-wk Total
              </th>
              {weekStarts.map((week, i) => (
                <th
                  key={week}
                  className={cn(
                    'sticky top-0 z-30 px-1 py-2.5 text-center text-[11px] font-semibold border-b-2 border-r border-gray-200 whitespace-nowrap',
                    i === 0
                      ? 'bg-gray-100 text-green-600'
                      : 'bg-gray-50 text-gray-500',
                  )}
                  style={{ width: 90, minWidth: 90 }}
                >
                  <span className="block">{formatWeekHeader(week, currentYear)}</span>
                  {i === 0 && (
                    <span className="block text-[9px] font-normal text-green-700 mt-0.5 uppercase tracking-wide">
                      current
                    </span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric, rowIdx) => {
              const rowBg = rowIdx % 2 === 0 ? '#ffffff' : '#f9fafb';
              const entries = getEntries(metric.id);
              const avgStr = calculateAverage(entries, metric.metric_type);
              const totalStr = calculateTotal(entries, metric.metric_type);
              const currentVal = entryMap.get(ck(metric.id, currentWeek));
              const isOffTrack = currentVal
                ? !evaluateGoal(currentVal, metric.goal_operator, metric.goal_value, metric.metric_type)
                : false;
              const flagTitle = `Scorecard: ${metric.title}`;

              return (
                <Fragment key={metric.id}>
                <tr className="group/row">
                  {/* Title — frozen */}
                  <td
                    className="sticky left-0 border-b border-r border-gray-200 px-3 py-2"
                    style={{
                      width: 220,
                      minWidth: 220,
                      background: rowBg,
                      zIndex: menuMetricId === metric.id ? 50 : 10,
                    }}
                  >
                    <div className="flex items-center gap-1 relative">
                      <span
                        className="flex-1 text-sm font-medium text-gray-900 truncate"
                        title={metric.title}
                      >
                        {metric.title}
                      </span>
                      {/* Flag for IDS (runner context) */}
                      {onFlagForIDS && isOffTrack && !flaggedTitles.has(flagTitle) && (
                        <button
                          onClick={() => onFlagForIDS(flagTitle)}
                          className="opacity-0 group-hover/row:opacity-100 text-[11px] text-green-700 hover:text-amber-600 transition-all whitespace-nowrap shrink-0"
                        >
                          Flag
                        </button>
                      )}
                      {onFlagForIDS && flaggedTitles.has(flagTitle) && (
                        <span className="text-[11px] text-green-700 shrink-0">Flagged</span>
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
                            className="opacity-0 group-hover/row:opacity-100 text-gray-400 hover:text-gray-900 px-1 py-0.5 rounded transition-all text-base leading-none"
                            title="Options"
                          >
                            ···
                          </button>
                          {menuMetricId === metric.id && (
                            <div
                              data-menu
                              className="absolute right-0 top-full mt-1 bg-gray-100 border border-gray-200 rounded-xl shadow-2xl overflow-hidden w-36 z-50"
                            >
                              <button
                                onClick={() => handleMove(metric.id, -1)}
                                disabled={rowIdx === 0}
                                className="w-full px-4 py-2.5 text-left text-sm text-gray-900 hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                              >
                                ↑ Move up
                              </button>
                              <button
                                onClick={() => handleMove(metric.id, 1)}
                                disabled={rowIdx === metrics.length - 1}
                                className="w-full px-4 py-2.5 text-left text-sm text-gray-900 hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                              >
                                ↓ Move down
                              </button>
                              <div className="border-t border-gray-200" />
                              <button
                                onClick={() => openEditModal(metric)}
                                className="w-full px-4 py-2.5 text-left text-sm text-gray-900 hover:bg-gray-200 transition-colors"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => requestDelete(metric.id)}
                                className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-gray-200 transition-colors"
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
                    className="sticky left-[220px] z-10 border-b border-r border-gray-200 px-3 py-2"
                    style={{ width: 110, minWidth: 110, background: rowBg }}
                  >
                    <span className="text-xs text-gray-500 whitespace-nowrap tabular-nums">
                      {formatOperator(metric.goal_operator)}{' '}
                      {formatValue(metric.goal_value, metric.metric_type)}
                    </span>
                  </td>

                  {/* Avg — frozen */}
                  <td
                    className="sticky left-[330px] z-10 border-b border-r border-gray-200 px-2 py-2 text-center"
                    style={{ width: 88, minWidth: 88, background: rowBg }}
                  >
                    <span className="text-xs text-gray-900 tabular-nums">{avgStr}</span>
                  </td>

                  {/* Total — frozen */}
                  <td
                    className="sticky left-[418px] z-10 border-b border-r border-gray-200 px-2 py-2 text-center"
                    style={{ width: 88, minWidth: 88, background: rowBg }}
                  >
                    <span className="text-xs text-gray-900 tabular-nums">{totalStr}</span>
                  </td>

                  {/* Week cells */}
                  {weekStarts.map(weekStart => renderCell(metric, weekStart))}
                </tr>

                {/* Inline delete confirmation (no browser alert/modal) */}
                {confirmingDeleteId === metric.id && (
                  <tr>
                    <td colSpan={4 + weekStarts.length} className="border-b border-gray-200 bg-red-50 px-4 py-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm text-gray-900">
                          Delete <span className="font-semibold">{metric.title}</span>? This removes all historical data.
                        </span>
                        <div className="flex items-center gap-2 ml-auto">
                          <button
                            onClick={() => setConfirmingDeleteId(null)}
                            disabled={deletingId === metric.id}
                            className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 text-xs font-medium hover:bg-gray-100 transition-colors disabled:opacity-50"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleConfirmDelete(metric.id)}
                            disabled={deletingId === metric.id}
                            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-colors disabled:opacity-50"
                          >
                            {deletingId === metric.id ? 'Deleting…' : 'Confirm Delete'}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}

            {metrics.length === 0 && (
              <tr>
                <td
                  colSpan={4 + weekStarts.length}
                  className="px-6 py-16 text-center text-gray-400 text-sm"
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

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] rounded-lg bg-gray-900 text-white text-sm font-medium px-4 py-2.5 shadow-2xl">
          {toast}
        </div>
      )}
    </>
  );
}
