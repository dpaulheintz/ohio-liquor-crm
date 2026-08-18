'use client';

import { useState } from 'react';
import { type BarrelPick } from '@/app/actions/barrel-pick-constants';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  isSameMonth,
  isToday,
  parseISO,
} from 'date-fns';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface CalendarEvent {
  id: string;
  pickId: string;
  date: string;
  label: string;
  type: 'pick' | 'bottling' | 'delivery';
  customerName: string;
  barrelType: string;
}

const EVENT_COLORS = {
  pick:     { bg: 'bg-amber-100 dark:bg-amber-900/50', text: 'text-amber-800 dark:text-amber-200', dot: 'bg-amber-500' },
  bottling: { bg: 'bg-blue-100 dark:bg-blue-900/50',   text: 'text-blue-800 dark:text-blue-200',   dot: 'bg-blue-500' },
  delivery: { bg: 'bg-emerald-100 dark:bg-emerald-900/50', text: 'text-emerald-800 dark:text-emerald-200', dot: 'bg-emerald-500' },
};

interface Props {
  picks: BarrelPick[];
  onSelect: (id: string) => void;
}

export function BarrelPickCalendar({ picks, onSelect }: Props) {
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const events: CalendarEvent[] = [];
  for (const p of picks) {
    if (p.status === 'cancelled') continue;
    if (p.pick_date) {
      events.push({
        id: `pick-${p.id}`, pickId: p.id, date: p.pick_date,
        label: `Pick: ${p.customer_name}`, type: 'pick',
        customerName: p.customer_name, barrelType: p.barrel_type ?? 'TBD',
      });
    }
    if (p.bottling_date) {
      events.push({
        id: `bottle-${p.id}`, pickId: p.id, date: p.bottling_date,
        label: `Bottle: ${p.customer_name}`, type: 'bottling',
        customerName: p.customer_name, barrelType: p.barrel_type ?? 'TBD',
      });
    }
    if (p.delivery_date) {
      events.push({
        id: `deliver-${p.id}`, pickId: p.id, date: p.delivery_date,
        label: `Deliver: ${p.customer_name}`, type: 'delivery',
        customerName: p.customer_name, barrelType: p.barrel_type ?? 'TBD',
      });
    }
  }

  const eventsByDate: Record<string, CalendarEvent[]> = {};
  for (const ev of events) {
    (eventsByDate[ev.date] ??= []).push(ev);
  }

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = getDay(monthStart);
  const totalCells = startPad + days.length;
  const weeks = Math.ceil(totalCells / 7);

  function prevMonth() {
    setCurrentMonth(d => { const n = new Date(d); n.setMonth(n.getMonth() - 1); return startOfMonth(n); });
    setSelectedDate(null);
  }
  function nextMonth() {
    setCurrentMonth(d => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return startOfMonth(n); });
    setSelectedDate(null);
  }

  function getDayCell(col: number, week: number): Date | null {
    const idx = week * 7 + col - startPad;
    return idx >= 0 && idx < days.length ? days[idx] : null;
  }

  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] ?? []) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 flex-1 justify-center">
          <Button variant="outline" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
          <h2 className="text-lg font-semibold min-w-[180px] text-center">{format(currentMonth, 'MMMM yyyy')}</h2>
          <Button variant="outline" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {(['pick', 'bottling', 'delivery'] as const).map(t => (
            <span key={t} className="flex items-center gap-1">
              <span className={cn('h-2.5 w-2.5 rounded-full', EVENT_COLORS[t].dot)} />
              {t === 'pick' ? 'Pick' : t === 'bottling' ? 'Bottling' : 'Delivery'}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <div className="grid grid-cols-7 border-b bg-muted/50">
          {DAY_LABELS.map(d => (
            <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
          ))}
        </div>

        {Array.from({ length: weeks }).map((_, weekIdx) => (
          <div key={weekIdx} className="grid grid-cols-7 border-b last:border-b-0">
            {Array.from({ length: 7 }).map((_, colIdx) => {
              const day = getDayCell(colIdx, weekIdx);
              if (!day) return <div key={colIdx} className="min-h-[80px] border-r last:border-r-0 bg-muted/20" />;

              const dateStr = format(day, 'yyyy-MM-dd');
              const dayEvents = eventsByDate[dateStr] ?? [];
              const inMonth = isSameMonth(day, currentMonth);
              const today = isToday(day);
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
                  onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                >
                  <div className={cn(
                    'text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-1',
                    today && 'bg-primary text-primary-foreground',
                  )}>
                    {format(day, 'd')}
                  </div>

                  <div className="hidden md:flex flex-col gap-0.5">
                    {dayEvents.slice(0, 3).map(ev => {
                      const c = EVENT_COLORS[ev.type];
                      return (
                        <div key={ev.id} className={cn('text-[10px] leading-tight px-1 py-0.5 rounded truncate font-medium', c.bg, c.text)}>
                          {ev.label}
                        </div>
                      );
                    })}
                    {dayEvents.length > 3 && (
                      <span className="text-[10px] text-muted-foreground px-1">+{dayEvents.length - 3} more</span>
                    )}
                  </div>

                  <div className="md:hidden flex flex-wrap gap-0.5 mt-0.5">
                    {dayEvents.slice(0, 4).map(ev => (
                      <span key={ev.id} className={cn('h-2 w-2 rounded-full', EVENT_COLORS[ev.type].dot)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {selectedDate && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">{format(parseISO(selectedDate), 'EEEE, MMMM d')}</h3>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedDate(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {selectedEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No events this day</p>
            ) : (
              <div className="space-y-2">
                {selectedEvents.map(ev => {
                  const c = EVENT_COLORS[ev.type];
                  return (
                    <button
                      key={ev.id}
                      className="w-full text-left flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                      onClick={() => onSelect(ev.pickId)}
                    >
                      <span className={cn('h-3 w-3 rounded-full shrink-0', c.dot)} />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm">{ev.customerName}</p>
                        <p className="text-xs text-muted-foreground">{ev.barrelType}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {ev.type === 'pick' ? 'Pick' : ev.type === 'bottling' ? 'Bottling' : 'Delivery'}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
