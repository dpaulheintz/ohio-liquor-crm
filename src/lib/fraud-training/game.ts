// "Scam or Legit?" — shared game rules (used by the phone and by the server, so grading matches).
import { CARDS, ROUNDS, type Answer, type FraudCard } from './cards';

export const CARDS_PER_ROUND = 6;
export const PASS_PERCENT = 80;
export const TRAINING_PATH = '/training/fraud';

export const LOCATIONS = [
  { value: 'gahanna', label: 'Gahanna' },
  { value: 'grandview', label: 'Grandview' },
  { value: 'westerville', label: 'Westerville' },
  { value: 'dsp', label: 'DSP' },
] as const;
export type TrainingLocation = (typeof LOCATIONS)[number]['value'];
export const locationLabel = (v: string) => LOCATIONS.find((l) => l.value === v)?.label ?? v;

// ─── Quarters (America/New_York) ─────────────────────────────────────────────

/** "2026-Q4" for the given moment, in Eastern time. */
export function quarterOf(at: Date = new Date()): string {
  const ymd = at.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD
  const m = Number(ymd.slice(5, 7));
  return `${ymd.slice(0, 4)}-Q${Math.ceil(m / 3)}`;
}
/** "2026-Q4" → "Q4 2026" */
export const quarterLabel = (q: string) => `${q.slice(5)} ${q.slice(0, 4)}`;

// ─── Dealing: 6 cards per round, 1-2 legit, seeded by quarter + a random nonce ─

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(xs: T[], rnd: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** The 30 card ids for one play, round by round. */
export function dealDeck(quarter: string, nonce: string, cards: FraudCard[] = CARDS): string[] {
  const rnd = mulberry32(hashString(`${quarter}|${nonce}`));
  const out: string[] = [];
  for (const r of ROUNDS) {
    const pool = cards.filter((c) => c.round === r.n);
    const legit = shuffle(pool.filter((c) => c.answer === 'legit'), rnd);
    const scam = shuffle(pool.filter((c) => c.answer === 'scam'), rnd);
    const nLegit = Math.min(legit.length, rnd() < 0.5 ? 1 : 2, CARDS_PER_ROUND);
    const pick = [...legit.slice(0, nLegit), ...scam.slice(0, CARDS_PER_ROUND - nLegit)];
    out.push(...shuffle(pick, rnd).map((c) => c.id));
  }
  return out;
}

export const cardById = (id: string) => CARDS.find((c) => c.id === id);

// ─── Scoring ──────────────────────────────────────────────────────────────────
// +100 per correct answer, x1.5 on a streak of 3-4, x2 on 5+, plus a small speed bonus
// (up to +25 for answering within ~1.5s, fading to 0 at 8s). No countdown timer.

export interface AnswerInput { id: string; answer: Answer; ms: number }
export interface Graded { id: string; correct: boolean; points: number; streak: number }

export const streakMultiplier = (streak: number) => (streak >= 5 ? 2 : streak >= 3 ? 1.5 : 1);
export function speedBonus(ms: number): number {
  const t = Math.max(0, Math.min(ms, 600000));
  if (t >= 8000) return 0;
  return Math.round(25 * Math.min(1, (8000 - t) / 6500));
}

export function gradeRun(answers: AnswerInput[]): { graded: Graded[]; score: number; correct: number; total: number; percent: number; bestStreak: number } {
  let score = 0, streak = 0, correct = 0, bestStreak = 0;
  const graded = answers.map((a) => {
    const card = cardById(a.id);
    const ok = !!card && card.answer === a.answer;
    let points = 0;
    if (ok) {
      streak++; correct++; bestStreak = Math.max(bestStreak, streak);
      points = Math.round(100 * streakMultiplier(streak)) + speedBonus(a.ms);
    } else streak = 0;
    score += points;
    return { id: a.id, correct: ok, points, streak };
  });
  const total = answers.length;
  const percent = total ? Math.round((correct / total) * 10000) / 100 : 0;
  return { graded, score, correct, total, percent, bestStreak };
}

export function badgeFor(percent: number): string {
  if (percent >= 97) return 'Fraud Bouncer';
  if (percent >= 90) return 'Scam Buster';
  if (percent >= PASS_PERCENT) return 'Sharp Eye';
  return 'Rookie (try again)';
}
export const passed = (percent: number) => percent >= PASS_PERCENT;

/** Names: trim, collapse spaces, drop control characters, cap at 40. Stored as typed otherwise. */
export function cleanName(v: unknown): string {
  return String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

/** What /api/fraud-training/submit returns on success. */
export interface SubmitResult {
  ok: true;
  attempt: {
    firstName: string; lastName: string; location: string; quarter: string; completedAt: string;
    score: number; correct: number; total: number; percent: number; badge: string; passed: boolean; code: string;
  };
}
