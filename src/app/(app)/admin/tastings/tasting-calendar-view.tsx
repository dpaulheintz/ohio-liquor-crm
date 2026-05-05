'use client';

import { useState } from 'react';
import type { Tasting } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, X, FileText, ExternalLink } from 'lucide-react';
import { statusConfig, formatTime } from './tasting-utils';
import { TastingFormDialog } from './tasting-form-dialog';
import { CompleteTastingDialog } from './complete-tasting-dialog';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameMonth, isToday, parseISO } from 'date-fns';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface TastingCalendarViewProps {
  tastings: Tasting[];
  onRefresh: () => void;
}

export function TastingCalendarView({ tastings, onRefresh }: TastingCalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [editingTasting, setEditingTasting] = useState<Tasting | null>(null);
  const [completingTasting, setCompletingTasting] = useState<Tasting | null>(null);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Pad the start so day 1 is on the right weekday column
  const startPad = getDay(monthStart); // 0=Sun, 1=Mon, ...
  const totalCells = startPad + days.length;
  const weeks = Math.ceil(totalCells / 7);

  // Map tastings by date string
  const tastingsByDate = tastings.reduce<Record<string, Tasting[]>>((acc, t) => {
    if (!acc[t.date]) acc[t.date] = [];
    acc[t.date].push(t);
    return acc;
  }, {});

  function prevMonth() {
    setCurrentMonth((d) => {
      const n = new Date(d);
      n.setMonth(n.getMonth() - 1);
      return startOfMonth(n);
    });
    setSelectedDate(null);
  }

  function nextMonth() {
    setCurrentMonth((d) => {
      const n = new Date(d);
      n.setMonth(n.getMonth() + 1);
      return startOfMonth(n);
    });
    setSelectedDate(null);
  }

  const selectedDateTastings = selectedDate ? (tastingsByDate[selectedDate] ?? []) : [];

  function getDayCell(colIdx: number, weekIdx: number): Date | null {
    const cellIdx = weekIdx * 7 + colIdx;
    const dayIdx = cellIdx - startPad;
    if (dayIdx < 0 || dayIdx >= days.length) return null;
    return days[dayIdx];
  }

  return (
    <div className="space-y-4">
      {/* Month Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={prevMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold">
          {format(currentMonth, 'MMMM yyyy')}
        </h2>
        <Button variant="outline" size="icon" onClick={nextMonth}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Calendar Grid */}
      <div className="rounded-lg border overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b bg-muted/50">
          {DAY_LABELS.map((d) => (
            <div
              key={d}
              className="py-2 text-center text-xs font-medium text-muted-foreground"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Weeks */}
        {Array.from({ length: weeks }).map((_, weekIdx) => (
          <div key={weekIdx} className="grid grid-cols-7 border-b last:border-b-0">
            {Array.from({ length: 7 }).map((_, colIdx) => {
              const day = getDayCell(colIdx, weekIdx);
              if (!day) {
                return (
                  <div
                    key={colIdx}
                    className="min-h-[80px] border-r last:border-r-0 bg-muted/20"
                  />
                );
              }
              const dateStr = format(day, 'yyyy-MM-dd');
              const dayTastings = tastingsByDate[dateStr] ?? [];
              const inMonth = isSameMonth(day, currentMonth);
              const todayDay = isToday(day);
              const isSelected = selectedDate === dateStr;

              return (
                <div
                  key={colIdx}
                  className={cn(
                    'min-h-[80px] border-r last:border-r-0 p-1 cursor-pointer transition-colors',
                    !inMonth && 'bg-muted/10 text-muted-foreground/40',
                    inMonth && 'hover:bg-muted/30',
                    isSelected && 'bg-primary/5 ring-1 ring-inset ring-primary/30'
                  )}
                  onClick={() =>
                    setSelectedDate(isSelected ? null : dateStr)
                  }
                >
                  <div
                    className={cn(
                      'text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1',
                      todayDay && 'bg-primary text-primary-foreground',
                      !todayDay && inMonth && 'text-foreground',
                      !inMonth && 'text-muted-foreground/40'
                    )}
                  >
                    {format(day, 'd')}
                  </div>

                  {/* Show up to 2 tasting dots on desktop, tiny dots on mobile */}
                  <div className="hidden md:flex flex-col gap-0.5">
                    {dayTastings.slice(0, 2).map((t) => {
                      const sc = statusConfig(t.status);
                      return (
                        <div
                          key={t.id}
                          className={cn(
                            'text-[10px] leading-tight px-1 py-0.5 rounded truncate font-medium',
                            sc.className
                          )}
                          title={t.agency?.display_name}
                        >
                          {formatTime(t.start_time)} {t.agency?.display_name}
                        </div>
                      );
                    })}
                    {dayTastings.length > 2 && (
                      <div className="text-[10px] text-muted-foreground px-1">
                        +{dayTastings.length - 2} more
                      </div>
                    )}
                  </div>

                  {/* Mobile: just dots */}
                  <div className="md:hidden flex flex-wrap gap-0.5 mt-0.5">
                    {dayTastings.slice(0, 4).map((t) => {
                      const sc = statusConfig(t.status);
                      return (
                        <span
                          key={t.id}
                          className={cn('h-2 w-2 rounded-full', sc.dotClass)}
                        />
                      );
                    })}
                    {dayTastings.length > 4 && (
                      <span className="text-[9px] text-muted-foreground">
                        +{dayTastings.length - 4}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Selected day detail panel */}
      {selectedDate && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">
                {format(parseISO(selectedDate), 'EEEE, MMMM d')}
              </h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setSelectedDate(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {selectedDateTastings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tastings this day</p>
            ) : (
              <div className="space-y-3">
                {selectedDateTastings.map((t) => {
                  const sc = statusConfig(t.status);
                  const isTerminal =
                    t.status === 'completed' || t.status === 'cancelled';
                  return (
                    <div
                      key={t.id}
                      className="flex items-start justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">
                            {t.agency?.display_name}
                          </span>
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                              sc.className
                            )}
                          >
                            {sc.label}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatTime(t.start_time)} – {formatTime(t.end_time)}
                          {(t.city ?? t.agency?.city) &&
                            ` · ${t.city ?? t.agency?.city}`}
                        </p>
                        {t.staff_category && (
                          <p className="text-xs text-muted-foreground">
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
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingTasting(t)}
                        >
                          Edit
                        </Button>
                        {!isTerminal && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-emerald-600 border-emerald-200"
                            onClick={() => setCompletingTasting(t)}
                          >
                            Done
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
