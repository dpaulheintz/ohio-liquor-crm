'use server';

// Barrel Arcade leaderboards: admin cleanup (CRM → Arcade Leaderboards). Admins only. The arcade tables
// have no RLS policies, so every read and write here goes through the service role after an admin check.
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { BLOCKED_INITIALS } from '@/lib/arcade/blocklist';
import { BOARD_SLUGS, BOARDS, INITIALS_RE, type BoardSlug } from '@/lib/arcade/config';

export interface ArcadeAdminEntry {
  id: number;
  game: BoardSlug;
  initials: string;
  score: number;
  rank: number;
  created_at: string;
}

export interface ArcadeAdminData {
  weekStart: string;
  boards: { game: BoardSlug; name: string; order: 'asc' | 'desc'; entries: ArcadeAdminEntry[] }[];
  builtInBlocked: string[];
  adminBlocked: { initials: string; created_at: string }[];
}

export async function isArcadeAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.rpc('is_admin');
  return data === true;
}

async function requireAdmin() {
  if (!(await isArcadeAdmin())) throw new Error('Admin only');
  return createAdminClient();
}

export async function getArcadeAdminData(): Promise<ArcadeAdminData> {
  const db = await requireAdmin();
  const [{ data: week, error: wErr }, { data: blocked, error: bErr }] = await Promise.all([
    db.rpc('arcade_week_start'),
    db.from('arcade_blocked_initials').select('initials, created_at').order('initials'),
  ]);
  if (wErr) throw new Error(wErr.message);
  if (bErr) throw new Error(bErr.message);
  const weekStart = week as string;

  const { data: rows, error } = await db
    .from('arcade_scores')
    .select('id, game, initials, score, created_at')
    .eq('week_start', weekStart)
    .limit(5000);
  if (error) throw new Error(error.message);

  const boards = BOARD_SLUGS.map((game) => {
    const cfg = BOARDS[game];
    const entries = (rows ?? [])
      .filter((r) => r.game === game)
      .sort((a, b) =>
        (cfg.order === 'asc' ? a.score - b.score : b.score - a.score) ||
        a.created_at.localeCompare(b.created_at) || a.id - b.id)
      .map((r, i) => ({ ...(r as Omit<ArcadeAdminEntry, 'rank'>), rank: i + 1 }));
    return { game, name: cfg.name, order: cfg.order, entries };
  });

  return { weekStart, boards, builtInBlocked: [...BLOCKED_INITIALS].sort(), adminBlocked: blocked ?? [] };
}

export async function removeArcadeScore(id: number): Promise<void> {
  if (!Number.isInteger(id)) throw new Error('Invalid entry');
  const db = await requireAdmin();
  const { error } = await db.from('arcade_scores').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/arcade-leaderboards');
}

/** Blocks the initials for future submits and removes every score this week that uses them. */
export async function blockArcadeInitials(initials: string): Promise<{ removed: number }> {
  const v = String(initials ?? '').trim().toUpperCase();
  if (!INITIALS_RE.test(v)) throw new Error('Initials must be 3 letters A-Z');
  const db = await requireAdmin();
  const { error } = await db.from('arcade_blocked_initials').upsert({ initials: v }, { onConflict: 'initials' });
  if (error) throw new Error(error.message);
  const { data: del, error: dErr } = await db.from('arcade_scores').delete().eq('initials', v).select('id');
  if (dErr) throw new Error(dErr.message);
  revalidatePath('/admin/arcade-leaderboards');
  return { removed: del?.length ?? 0 };
}

export async function unblockArcadeInitials(initials: string): Promise<void> {
  const v = String(initials ?? '').trim().toUpperCase();
  if (!INITIALS_RE.test(v)) throw new Error('Initials must be 3 letters A-Z');
  const db = await requireAdmin();
  const { error } = await db.from('arcade_blocked_initials').delete().eq('initials', v);
  if (error) throw new Error(error.message);
  revalidatePath('/admin/arcade-leaderboards');
}
