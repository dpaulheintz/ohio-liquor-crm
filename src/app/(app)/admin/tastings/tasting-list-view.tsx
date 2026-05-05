'use client';

import { useState } from 'react';
import type { Tasting } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import {
  CheckCircle,
  XCircle,
  Pencil,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  FileText,
  ExternalLink,
} from 'lucide-react';
import { cancelTasting } from '@/app/actions/tastings';
import { toast } from 'sonner';
import { TastingFormDialog } from './tasting-form-dialog';
import { CompleteTastingDialog } from './complete-tasting-dialog';
import { statusConfig, formatTime } from './tasting-utils';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';

type SortKey = 'date' | 'agency' | 'city' | 'staff_category' | 'status';
type SortDir = 'asc' | 'desc';

interface TastingListViewProps {
  tastings: Tasting[];
  onRefresh: () => void;
}

export function TastingListView({ tastings, onRefresh }: TastingListViewProps) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [editingTasting, setEditingTasting] = useState<Tasting | null>(null);
  const [completingTasting, setCompletingTasting] = useState<Tasting | null>(null);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }

  const filtered = tastings
    .filter((t) => statusFilter === 'all' || t.status === statusFilter)
    .filter((t) => categoryFilter === 'all' || t.staff_category === categoryFilter)
    .filter(
      (t) =>
        !cityFilter ||
        (t.city ?? t.agency?.city ?? '').toLowerCase().includes(cityFilter.toLowerCase())
    )
    .filter((t) => !dateFrom || t.date >= dateFrom)
    .filter((t) => !dateTo || t.date <= dateTo)
    .sort((a, b) => {
      let va = '', vb = '';
      switch (sortKey) {
        case 'date':
          va = a.date + a.start_time;
          vb = b.date + b.start_time;
          break;
        case 'agency':
          va = a.agency?.display_name ?? '';
          vb = b.agency?.display_name ?? '';
          break;
        case 'city':
          va = a.city ?? a.agency?.city ?? '';
          vb = b.city ?? b.agency?.city ?? '';
          break;
        case 'staff_category':
          va = a.staff_category ?? '';
          vb = b.staff_category ?? '';
          break;
        case 'status':
          va = a.status;
          vb = b.status;
          break;
      }
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });

  const hasFilters =
    statusFilter !== 'all' || categoryFilter !== 'all' || cityFilter || dateFrom || dateTo;

  async function handleCancel(t: Tasting) {
    if (!confirm(`Cancel tasting at ${t.agency?.display_name} on ${t.date}?`)) return;
    try {
      await cancelTasting(t.id);
      toast.success('Tasting cancelled');
      onRefresh();
    } catch {
      toast.error('Failed to cancel tasting');
    }
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <ChevronsUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === 'asc' ? (
      <ChevronUp className="h-3 w-3" />
    ) : (
      <ChevronDown className="h-3 w-3" />
    );
  }

  const cols: { key: SortKey; label: string }[] = [
    { key: 'date', label: 'Date / Time' },
    { key: 'agency', label: 'Agency' },
    { key: 'city', label: 'City' },
    { key: 'staff_category', label: 'Staff' },
    { key: 'status', label: 'Status' },
  ];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="needs_staff">Needs Staff</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="staffed">Staffed</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="DBC">DBC</SelectItem>
            <SelectItem value="HB Internal Staff">HB Internal Staff</SelectItem>
            <SelectItem value="HB Sales Team">HB Sales Team</SelectItem>
          </SelectContent>
        </Select>

        <Input
          placeholder="Filter by city…"
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          className="w-36"
        />

        <div className="flex items-center gap-1">
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-36"
          />
          <span className="text-muted-foreground text-sm">–</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-36"
          />
        </div>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStatusFilter('all');
              setCategoryFilter('all');
              setCityFilter('');
              setDateFrom('');
              setDateTo('');
            }}
          >
            Clear filters
          </Button>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} of {tastings.length} tastings
        </span>
      </div>

      {/* Desktop Table */}
      <div className="hidden md:block">
        {filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            No tastings match your filters
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 border-b">
                  {cols.map((col) => (
                    <th
                      key={col.key}
                      className="px-4 py-3 text-left font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none"
                      onClick={() => toggleSort(col.key)}
                    >
                      <span className="flex items-center gap-1">
                        {col.label} <SortIcon k={col.key} />
                      </span>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground w-28">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((t) => {
                  const sc = statusConfig(t.status);
                  const isTerminal =
                    t.status === 'completed' || t.status === 'cancelled';
                  return (
                    <tr
                      key={t.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {format(parseISO(t.date), 'MMM d, yyyy')}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatTime(t.start_time)} – {formatTime(t.end_time)}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{t.agency?.display_name}</div>
                        {t.agency?.agency_id && (
                          <div className="text-xs text-muted-foreground">
                            #{t.agency.agency_id}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {t.city ?? t.agency?.city ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        {t.staff_category ? (
                          <>
                            <div className="text-xs font-medium">{t.staff_category}</div>
                            {t.staff_person && (
                              <div className="text-xs text-muted-foreground">
                                {t.staff_person}
                              </div>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                              sc.className
                            )}
                          >
                            {sc.label}
                          </span>
                          {t.report_url && (
                            <a
                              href={t.report_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="View report"
                            >
                              <FileText className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Edit"
                            onClick={() => setEditingTasting(t)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          {!isTerminal && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-emerald-600 hover:text-emerald-600"
                                title="Mark complete"
                                onClick={() => setCompletingTasting(t)}
                              >
                                <CheckCircle className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                title="Cancel tasting"
                                onClick={() => handleCancel(t)}
                              >
                                <XCircle className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            No tastings match your filters
          </div>
        ) : (
          filtered.map((t) => {
            const sc = statusConfig(t.status);
            const isTerminal =
              t.status === 'completed' || t.status === 'cancelled';
            return (
              <Card key={t.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">
                        {t.agency?.display_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {format(parseISO(t.date), 'MMM d, yyyy')} ·{' '}
                        {formatTime(t.start_time)}–{formatTime(t.end_time)}
                      </p>
                      {(t.city ?? t.agency?.city) && (
                        <p className="text-xs text-muted-foreground">
                          {t.city ?? t.agency?.city}
                        </p>
                      )}
                    </div>
                    <span
                      className={cn(
                        'shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                        sc.className
                      )}
                    >
                      {sc.label}
                    </span>
                  </div>

                  {t.staff_category && (
                    <p className="text-xs">
                      <span className="text-muted-foreground">Staff: </span>
                      {t.staff_category}
                      {t.staff_person ? ` — ${t.staff_person}` : ''}
                    </p>
                  )}

                  {t.notes && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {t.notes}
                    </p>
                  )}

                  {t.report_url && (
                    <a
                      href={t.report_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <FileText className="h-3 w-3" /> View Report{' '}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}

                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingTasting(t)}
                    >
                      Edit
                    </Button>
                    {!isTerminal && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-emerald-600 border-emerald-200"
                          onClick={() => setCompletingTasting(t)}
                        >
                          Complete
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground"
                          onClick={() => handleCancel(t)}
                        >
                          Cancel
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <TastingFormDialog
        open={!!editingTasting}
        onOpenChange={(open) => { if (!open) setEditingTasting(null); }}
        onSuccess={onRefresh}
        tasting={editingTasting ?? undefined}
      />

      <CompleteTastingDialog
        tasting={completingTasting}
        open={!!completingTasting}
        onOpenChange={(open) => { if (!open) setCompletingTasting(null); }}
        onSuccess={onRefresh}
      />
    </div>
  );
}
