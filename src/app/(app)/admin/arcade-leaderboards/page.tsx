import { redirect } from 'next/navigation';
import { getArcadeAdminData, isArcadeAdmin, type ArcadeAdminData } from '@/app/actions/arcade';
import { ArcadeLeaderboardsClient } from './arcade-leaderboards-client';

export const metadata = { title: 'Arcade Leaderboards | High Bank CRM' };
export const dynamic = 'force-dynamic';

export default async function ArcadeLeaderboardsPage() {
  if (!(await isArcadeAdmin())) redirect('/');

  let data: ArcadeAdminData | null = null;
  let loadError: string | null = null;
  try {
    data = await getArcadeAdminData();
  } catch (err) {
    loadError = err instanceof Error ? err.message : 'Failed to load leaderboards';
  }

  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="border-b px-4 sm:px-6 py-5">
        <div className="max-w-4xl mx-auto">
          <h1 className="font-serif text-2xl font-bold tracking-wide">Arcade Leaderboards</h1>
          <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-widest">
            Barrel Arcade · this week&apos;s entries · resets Monday 12:00 AM ET
          </p>
        </div>
      </div>
      <div className="px-4 sm:px-6 py-6 max-w-4xl mx-auto">
        {loadError || !data ? (
          <p className="text-sm text-destructive">{loadError ?? 'Failed to load leaderboards'}</p>
        ) : (
          <ArcadeLeaderboardsClient data={data} />
        )}
      </div>
    </div>
  );
}
