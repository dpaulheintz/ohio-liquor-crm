'use client';

import Link from 'next/link';
import type { Meeting, MeetingNote, PersonRating } from '@/lib/eos/meetings';
import type { Todo } from '@/lib/eos/todos';
import { cn } from '@/lib/utils';

type Props = {
  meeting: Meeting;
  notes: MeetingNote[];
  meetingTodos: Todo[];
  ratings: PersonRating[];
};

const SECTION_ORDER = [
  { key: 'segue',     label: 'Segue' },
  { key: 'scorecard', label: 'Scorecard Review' },
  { key: 'barrels',   label: 'Barrel Review' },
  { key: 'headlines', label: 'Headlines' },
  { key: 'todos',     label: 'To-Do Review' },
  { key: 'ids',       label: 'IDS — Opportunities' },
  { key: 'conclude',  label: 'Conclude' },
];

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function fmtDuration(start: string | null, end: string | null) {
  if (!start || !end) return '—';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} minutes`;
  return `${h}h ${m}m`;
}

function ratingColor(r: number) {
  if (r >= 8) return 'text-green-400';
  if (r >= 6) return 'text-yellow-400';
  return 'text-red-400';
}

export default function SummaryClient({ meeting, notes, meetingTodos, ratings }: Props) {
  const noteMap = new Map(notes.map(n => [n.section, n.content ?? '']));

  return (
    <div className="print:bg-white print:text-black">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 print:mb-4">
        <div>
          <h1 className="font-serif text-3xl font-bold text-white print:text-black">Meeting Summary</h1>
          <div className="flex items-center gap-4 mt-2 text-sm text-zinc-400 print:text-gray-600 flex-wrap">
            <span>{fmtDate(meeting.started_at)}</span>
            <span>{fmtDuration(meeting.started_at, meeting.ended_at)}</span>
            {meeting.rating && (
              <span className={cn('font-semibold', ratingColor(meeting.rating))}>
                Rating: {meeting.rating}/10
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 print:hidden">
          <button
            onClick={() => window.print()}
            className="px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 text-sm hover:bg-zinc-800 transition-colors"
          >
            Print / Export
          </button>
          <Link
            href="/eos/meetings"
            className="px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 text-sm hover:bg-zinc-800 transition-colors"
          >
            ← Back
          </Link>
        </div>
      </div>

      {/* Per-person ratings */}
      {ratings.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 print:text-gray-500 mb-2">
            Individual Ratings
          </h3>
          <div className="rounded-xl border border-zinc-800 print:border-gray-300 bg-[#111] print:bg-gray-50 px-5 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {ratings.map(r => (
                <div key={r.id} className="flex items-center gap-3">
                  <span className="text-sm text-zinc-300 print:text-gray-700 flex-1">{r.person_name}</span>
                  <span className={cn('text-sm font-semibold tabular-nums', ratingColor(r.rating))}>
                    {r.rating}/10
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* General notes */}
      {meeting.notes && (
        <div className="mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 print:text-gray-500 mb-2">
            Closing Notes
          </h3>
          <div className="rounded-xl border border-zinc-800 print:border-gray-300 bg-[#111] print:bg-gray-50 px-5 py-4">
            <p className="text-sm text-zinc-300 print:text-gray-800 whitespace-pre-wrap">{meeting.notes}</p>
          </div>
        </div>
      )}

      {/* Section notes */}
      {SECTION_ORDER.map(s => {
        const content = noteMap.get(s.key);
        if (!content) return null;
        return (
          <div key={s.key} className="mb-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 print:text-gray-500 mb-2">
              {s.label}
            </h3>
            <div className="rounded-xl border border-zinc-800 print:border-gray-300 bg-[#111] print:bg-gray-50 px-5 py-4">
              <p className="text-sm text-zinc-300 print:text-gray-800 whitespace-pre-wrap">{content}</p>
            </div>
          </div>
        );
      })}

      {/* Todos created */}
      {meetingTodos.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 print:text-gray-500 mb-2">
            To-Dos Created ({meetingTodos.length})
          </h3>
          <div className="space-y-1">
            {meetingTodos.map(t => (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-xl border border-zinc-800 print:border-gray-300 bg-[#111] print:bg-gray-50 px-4 py-2.5"
              >
                <div className={cn(
                  'w-4 h-4 rounded border flex items-center justify-center shrink-0',
                  t.completed
                    ? 'bg-green-700 border-green-700'
                    : 'border-zinc-600 print:border-gray-400',
                )}>
                  {t.completed && (
                    <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5l2.5 2.5L8 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className={cn(
                  'text-sm flex-1',
                  t.completed ? 'line-through text-zinc-600' : 'text-zinc-200 print:text-gray-800',
                )}>
                  {t.title}
                </span>
                {t.owner_name && <span className="text-xs text-zinc-500">{t.owner_name}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {!meeting.notes && notes.length === 0 && meetingTodos.length === 0 && ratings.length === 0 && (
        <div className="rounded-xl border border-zinc-800 bg-[#111] px-8 py-12 text-center text-zinc-600 text-sm">
          No notes or to-dos were recorded during this meeting.
        </div>
      )}
    </div>
  );
}
