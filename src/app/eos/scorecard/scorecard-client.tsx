'use client';

import { useState, useEffect } from 'react';
import type { Metric, Entry } from '@/lib/eos/scorecard';
import ScorecardGrid from '@/components/eos/ScorecardGrid';
import SmartAddButton from '@/components/eos/SmartAddButton';

type Props = {
  initialMetrics: Metric[];
  initialEntries: Entry[];
  weekStarts: string[];
  isAdmin: boolean;
};

export default function ScorecardClient({ initialMetrics, initialEntries, weekStarts, isAdmin }: Props) {
  const currentWeek = weekStarts[0] ?? '';

  // New-week banner: show Mon–Wed, dismiss stored in localStorage per week
  const [bannerDismissed, setBannerDismissed] = useState(false);
  useEffect(() => {
    const key = `scorecard_banner_${currentWeek}`;
    if (localStorage.getItem(key)) setBannerDismissed(true);
  }, [currentWeek]);

  const dayOfWeek = new Date().getDay();
  const showNewWeekBanner = !bannerDismissed && dayOfWeek >= 1 && dayOfWeek <= 3 && !!currentWeek;

  function dismissNewWeekBanner() {
    localStorage.setItem(`scorecard_banner_${currentWeek}`, '1');
    setBannerDismissed(true);
  }

  return (
    <>
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-gray-900" style={{ letterSpacing: '-0.02em' }}>Scorecard</h1>
        <p className="text-gray-500 mt-1 text-sm">Weekly metrics — click any cell to edit</p>
      </div>

      {/* New-week banner */}
      {showNewWeekBanner && (
        <div className="flex items-center gap-3 mb-5 rounded-xl border border-gray-200 bg-green-50 px-4 py-3 text-sm text-green-600">
          <span className="text-base">📋</span>
          <span className="flex-1">It&apos;s a new week — don&apos;t forget to enter this week&apos;s numbers.</span>
          <button
            onClick={dismissNewWeekBanner}
            className="shrink-0 text-green-600 hover:text-green-600 text-lg leading-none transition-colors"
          >
            ×
          </button>
        </div>
      )}

      {/* Full scorecard grid (handles mobile + desktop views, admin controls) */}
      <ScorecardGrid
        initialMetrics={initialMetrics}
        initialEntries={initialEntries}
        weekStarts={weekStarts}
        isAdmin={isAdmin}
      />

      <SmartAddButton pageContext={isAdmin ? 'scorecard' : 'todos'} />
    </>
  );
}
