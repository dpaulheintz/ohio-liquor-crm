'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Meeting } from '@/lib/eos/meetings';
import { startMeetingAction } from './actions';
import SmartAddButton from '@/components/eos/SmartAddButton';
import { cn } from '@/lib/utils';

type Props = { initialMeetings: Meeting[] };

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDuration(start: string | null, end: string | null) {
  if (!start) return '—';
  if (!end) return 'In progress…';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function ratingColor(r: number | null) {
  if (!r) return 'bg-[#3D2E1E]';
  if (r >= 8) return 'bg-[#C9963A]';
  if (r >= 6) return 'bg-[#D4821A]';
  return 'bg-[#C0392B]';
}

export default function MeetingsClient({ initialMeetings }: Props) {
  const router = useRouter();
  const [meetings] = useState(initialMeetings);
  const [showStartModal, setShowStartModal] = useState(false);
  const [starting, setStarting] = useState(false);

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

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-serif text-3xl font-bold text-[#F5ECD7]" style={{ letterSpacing: '-0.02em' }}>Meetings</h1>
          <p className="text-[#B8A99A] mt-1 text-sm">Run your Level 10 and track meeting history</p>
        </div>
        <button
          onClick={() => setShowStartModal(true)}
          className="px-5 py-2.5 rounded-lg bg-[#C9963A] hover:bg-[#E8B86D] text-[#0E0B07] text-sm font-medium transition-colors flex items-center gap-2"
        >
          <span className="text-base">▶</span> Start Level 10
        </button>
      </div>

      {/* Meeting History */}
      {meetings.length === 0 ? (
        <div className="rounded-xl border border-[#3D2E1E] bg-[#1C1510] px-8 py-16 text-center">
          <p className="text-[#B8A99A] text-sm">No meetings yet. Click &ldquo;Start Level 10&rdquo; to run your first meeting.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-[#3D2E1E] overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_130px_100px_80px_1fr_100px] gap-2 px-4 py-2.5 bg-[#0E0B07] border-b border-[#3D2E1E] text-[11px] font-semibold uppercase tracking-wider text-[#B8A99A]">
            <span>Date</span>
            <span>Type</span>
            <span>Duration</span>
            <span>Rating</span>
            <span>Notes</span>
            <span></span>
          </div>

          {meetings.map((m, idx) => (
            <div
              key={m.id}
              className={cn(
                'grid grid-cols-[1fr_130px_100px_80px_1fr_100px] gap-2 px-4 py-3 items-center border-b border-[#3D2E1E]',
                idx % 2 === 0 ? 'bg-[#1C1510]' : 'bg-[#221A11]',
              )}
            >
              <span className="text-sm text-[#F5ECD7]">{fmtDate(m.started_at)}</span>
              <span className="text-xs text-[#B8A99A]">Level 10 Meeting</span>
              <span className={cn('text-xs', m.ended_at ? 'text-[#B8A99A]' : 'text-[#C9963A] font-medium')}>
                {fmtDuration(m.started_at, m.ended_at)}
              </span>
              <span className="flex items-center gap-1.5">
                {m.rating ? (
                  <>
                    <span className={cn('w-2 h-2 rounded-full', ratingColor(m.rating))} />
                    <span className="text-xs text-[#F5ECD7]">{m.rating}/10</span>
                  </>
                ) : (
                  <span className="text-xs text-[#6B5A4A]">—</span>
                )}
              </span>
              <span className="text-xs text-[#B8A99A] truncate">
                {m.notes ? m.notes.slice(0, 60) + (m.notes.length > 60 ? '…' : '') : '—'}
              </span>
              <span>
                {m.ended_at ? (
                  <Link
                    href={`/eos/meetings/${m.id}`}
                    className="text-xs text-[#C9963A] hover:text-[#E8B86D] font-medium transition-colors"
                  >
                    View Summary
                  </Link>
                ) : (
                  <Link
                    href={`/eos/meetings/${m.id}/run`}
                    className="text-xs text-[#C9963A] hover:text-[#E8B86D] font-medium transition-colors"
                  >
                    Resume ▶
                  </Link>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Start Meeting Modal */}
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
      <SmartAddButton pageContext="meetings" />
    </>
  );
}
