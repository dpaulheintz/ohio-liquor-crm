'use client';

import { TrendingUp, TrendingDown } from 'lucide-react';

export interface HotAccount {
  account_key: string;
  account_name: string | null;
  recent_bottles: number;
  prior_bottles: number;
  bottle_change: number;
  pct_change: number | null;
  top_product: string | null;
  recent_revenue: number;
}

interface HotAccountsProps {
  growing: HotAccount[];
  declining: HotAccount[];
  recentPeriod: string;   // e.g. "Jan–Mar 2026"
  priorPeriod: string;    // e.g. "Oct–Dec 2025"
}

function AccountRow({
  account,
  direction,
  rank,
}: {
  account: HotAccount;
  direction: 'up' | 'down';
  rank: number;
}) {
  const isUp = direction === 'up';
  const pctLabel =
    account.pct_change !== null
      ? `${isUp ? '+' : ''}${account.pct_change.toFixed(0)}%`
      : account.prior_bottles === 0
      ? 'NEW'
      : '—';

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-zinc-800 last:border-0 group">
      <span className="text-xs text-zinc-600 w-4 shrink-0 text-right font-mono">{rank}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-200 truncate font-medium group-hover:text-white transition-colors">
          {account.account_name || account.account_key}
        </p>
        {account.top_product && (
          <p className="text-xs text-zinc-600 truncate">{account.top_product}</p>
        )}
      </div>
      <div className="flex flex-col items-end shrink-0 gap-0.5">
        <span
          className={`text-sm font-bold font-mono ${isUp ? 'text-emerald-400' : 'text-red-400'}`}
        >
          {pctLabel}
        </span>
        <span className="text-xs text-zinc-500 font-mono">
          {isUp ? '+' : ''}{account.bottle_change.toLocaleString()} btl
        </span>
      </div>
    </div>
  );
}

function AccountPanel({
  title,
  subtitle,
  accounts,
  direction,
  icon: Icon,
  accentColor,
}: {
  title: string;
  subtitle: string;
  accounts: HotAccount[];
  direction: 'up' | 'down';
  icon: typeof TrendingUp;
  accentColor: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-[#111111] overflow-hidden flex flex-col">
      <div className="px-4 pt-4 pb-3 border-b border-zinc-800 flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0" style={{ color: accentColor }} />
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          <p className="text-xs text-zinc-500">{subtitle}</p>
        </div>
      </div>
      <div className="px-4 flex-1">
        {accounts.length === 0 ? (
          <p className="py-6 text-center text-sm text-zinc-600">No data</p>
        ) : (
          accounts.map((a, i) => (
            <AccountRow key={a.account_key} account={a} direction={direction} rank={i + 1} />
          ))
        )}
      </div>
    </div>
  );
}

export function HotAccounts({ growing, declining, recentPeriod, priorPeriod }: HotAccountsProps) {
  const subtitle = `${recentPeriod} vs ${priorPeriod}`;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <AccountPanel
        title="🔥 Fastest Growing"
        subtitle={subtitle}
        accounts={growing}
        direction="up"
        icon={TrendingUp}
        accentColor="#34d399"
      />
      <AccountPanel
        title="⚠️ Declining Accounts"
        subtitle={subtitle}
        accounts={declining}
        direction="down"
        icon={TrendingDown}
        accentColor="#f87171"
      />
    </div>
  );
}
