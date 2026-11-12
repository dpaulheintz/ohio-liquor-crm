// "Scam or Legit?": record a finished run. Public.
//
// The page sends the run token (which lists the dealt cards), the answers and the player's name and
// location. Grading happens here from src/lib/fraud-training/cards.ts, so stored scores can be trusted.
// Order: rate limit (10 / 10 min) → token → answers match the dealt cards → minimum play time →
// name + location → grade → insert (one record per run).
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { LOCATIONS, badgeFor, cleanName, gradeRun, passed, type AnswerInput, type SubmitResult } from '@/lib/fraud-training/game';
import { completionCode, underRateLimit, verifyRunToken } from '@/lib/fraud-training/server';

export const dynamic = 'force-dynamic';

const MIN_SECONDS = 30; // nobody reads 30 cards faster than this
const bad = (status = 400, error?: string) => NextResponse.json({ ok: false, ...(error ? { error } : {}) }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: NextRequest) {
  try {
    if (!(await underRateLimit(request.headers, 'submit'))) return bad(429, 'Too many tries. Wait a few minutes and try again.');
  } catch {
    return bad(503, 'Could not save right now. Try again in a minute.');
  }

  let body: { token?: unknown; answers?: unknown; firstName?: unknown; lastName?: unknown; location?: unknown };
  try { body = await request.json(); } catch { return bad(); }

  const now = Date.now();
  const run = verifyRunToken(body.token, now);
  if (!run) return bad(400, 'This game expired. Tap Play again to start a fresh one.');

  const answers = Array.isArray(body.answers) ? (body.answers as AnswerInput[]) : [];
  if (answers.length !== run.ids.length) return bad();
  for (let i = 0; i < answers.length; i++) {
    const a = answers[i];
    if (!a || a.id !== run.ids[i] || (a.answer !== 'scam' && a.answer !== 'legit') || typeof a.ms !== 'number' || !Number.isFinite(a.ms)) return bad();
  }
  if ((now - run.t) / 1000 < MIN_SECONDS) return bad();

  const firstName = cleanName(body.firstName), lastName = cleanName(body.lastName);
  const location = String(body.location ?? '');
  if (!firstName || !lastName) return bad(400, 'Please enter your first and last name.');
  if (!LOCATIONS.some((l) => l.value === location)) return bad(400, 'Please pick your location.');

  const g = gradeRun(answers.map((a) => ({ id: a.id, answer: a.answer, ms: Math.max(0, Math.min(a.ms, 600000)) })));
  const db = createAdminClient();

  // Already recorded this run (double tap / retry)? Return the same record.
  const existing = await db.from('fraud_training_attempts').select('*').eq('run_id', run.n).maybeSingle();
  if (existing.data) return NextResponse.json(toResult(existing.data));

  const row = {
    first_name: firstName, last_name: lastName, location, quarter: run.q,
    score: g.score, correct_count: g.correct, total_count: g.total, percent: g.percent,
    passed: passed(g.percent), badge: badgeFor(g.percent),
    missed_card_ids: g.graded.filter((x) => !x.correct).map((x) => x.id), dealt_card_ids: run.ids,
    started_at: new Date(run.t).toISOString(), completed_at: new Date(now).toISOString(),
    duration_seconds: Math.round((now - run.t) / 1000), run_id: run.n,
  };
  for (let tries = 0; tries < 6; tries++) {
    const { data, error } = await db.from('fraud_training_attempts').insert({ ...row, completion_code: completionCode() }).select('*').single();
    if (!error) return NextResponse.json(toResult(data));
    if (error.code === '23505' && /run_id/.test(error.message)) {
      const again = await db.from('fraud_training_attempts').select('*').eq('run_id', run.n).single();
      if (again.data) return NextResponse.json(toResult(again.data));
    }
    if (error.code !== '23505') { console.error('fraud training submit:', error.message); break; }
  }
  return bad(503, 'Could not save right now. Try again in a minute.');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toResult(r: any): SubmitResult {
  return {
    ok: true,
    attempt: {
      firstName: r.first_name, lastName: r.last_name, location: r.location, quarter: r.quarter, completedAt: r.completed_at,
      score: r.score, correct: r.correct_count, total: r.total_count, percent: Number(r.percent), badge: r.badge, passed: r.passed,
      code: r.completion_code,
    },
  };
}
