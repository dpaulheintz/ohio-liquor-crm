// Barrel Arcade (/play) leaderboards: the server's view of every board. Tune plausibility limits here.
//
// Each run gets a signed token at game start (/api/arcade/start). A score is accepted only when:
//   - the token is valid, for this board, and younger than TOKEN_TTL_MS,
//   - at least `minSeconds` passed between the token and the submit,
//   - the score is a whole number within the board's limits:
//       high-score boards: 0..maxScore and no more than `baseScore + perSecond * elapsed`
//       Paint by Numbers (fastest finish, seconds): minScore..maxScore.
// The limits are deliberately generous; they stop impossible scores, not good players.

export type BoardSlug =
  | 'rush' | 'stack' | 'jump' | 'fork' | 'pack' | 'cross' | 'slice'
  | 'paint-easy' | 'paint-medium' | 'paint-hard';

export interface BoardConfig {
  name: string;
  /** 'desc': highest score wins. 'asc': lowest wins (Paint by Numbers finish time in seconds). */
  order: 'desc' | 'asc';
  minSeconds: number;
  maxScore: number;
  /** asc boards: the fastest finish we believe a person can do. */
  minScore?: number;
  /** desc boards: points-per-second ceiling since the run token was issued. */
  perSecond?: number;
  baseScore?: number;
}

export const BOARDS: Record<BoardSlug, BoardConfig> = {
  // 90-second shift; a bill is at most $2 x 3 guests + 3 hearts, plus up to $3 combo.
  rush: { name: 'Dinner Rush', order: 'desc', minSeconds: 60, maxScore: 600, perSecond: 6, baseScore: 20 },
  // One barrel per drop; drops can't come faster than a few a second.
  stack: { name: 'Barrel Stacker', order: 'desc', minSeconds: 3, maxScore: 1000, perSecond: 3, baseScore: 5 },
  // Seconds survived + 2 per angel's share.
  jump: { name: 'Barrel Jumper', order: 'desc', minSeconds: 3, maxScore: 5000, perSecond: 3, baseScore: 10 },
  // Barrel train length; 2-minute round.
  fork: { name: 'Barrel Collector', order: 'desc', minSeconds: 5, maxScore: 2000, perSecond: 20, baseScore: 30 },
  // Points from cells placed and lines shipped; no clock.
  pack: { name: 'Rick Packer', order: 'desc', minSeconds: 5, maxScore: 500000, perSecond: 120, baseScore: 200 },
  // Rows hopped.
  cross: { name: 'Rickhouse Crossing', order: 'desc', minSeconds: 3, maxScore: 10000, perSecond: 8, baseScore: 10 },
  // Fruit sliced + combos.
  slice: { name: 'Garnish Slice', order: 'desc', minSeconds: 3, maxScore: 50000, perSecond: 30, baseScore: 20 },
  // Fastest finish (seconds). Floors are about a quarter second per region on the smallest page of each level.
  'paint-easy': { name: 'Paint by Numbers · Easy', order: 'asc', minSeconds: 5, minScore: 28, maxScore: 4 * 3600 },
  'paint-medium': { name: 'Paint by Numbers · Medium', order: 'asc', minSeconds: 5, minScore: 36, maxScore: 4 * 3600 },
  'paint-hard': { name: 'Paint by Numbers · Hard', order: 'asc', minSeconds: 5, minScore: 84, maxScore: 4 * 3600 },
};

export const BOARD_SLUGS = Object.keys(BOARDS) as BoardSlug[];
export const isBoardSlug = (s: unknown): s is BoardSlug => typeof s === 'string' && s in BOARDS;

/** A run token is good for this long (Rick Packer has no clock; paint pages can take a while). */
export const TOKEN_TTL_MS = 4 * 60 * 60 * 1000;

/** Submits allowed per visitor per window. */
export const RATE_LIMIT = { max: 10, windowMs: 10 * 60 * 1000 };

export const INITIALS_RE = /^[A-Z]{3}$/;

/** Is `score` within the board's limits for a run that has lasted `elapsedSec`? */
export function scoreIsPlausible(board: BoardConfig, score: number, elapsedSec: number): boolean {
  if (!Number.isInteger(score) || score < 0 || score > board.maxScore) return false;
  if (elapsedSec < board.minSeconds) return false;
  if (board.order === 'asc') return score >= (board.minScore ?? 1);
  return score <= (board.baseScore ?? 0) + (board.perSecond ?? 0) * elapsedSec;
}
