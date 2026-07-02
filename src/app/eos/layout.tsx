import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { isEosUser, isEosAdmin } from '@/lib/eos-auth';
import { EOS_TEAM_MEMBERS } from '@/lib/eos/team';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'EOS | High Bank' };

export default async function EosLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !isEosUser(user.email)) {
    redirect('/');
  }

  // Check for any in-progress meeting
  const { data: activeMeeting } = await supabase
    .from('eos_meetings')
    .select('id')
    .not('started_at', 'is', null)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const activeMeetingId = activeMeeting?.id ?? null;
  const email = user.email ?? '';
  const admin = isEosAdmin(email);
  const member = EOS_TEAM_MEMBERS.find(m => m.email === email.toLowerCase());
  const displayName = member?.name ?? email;
  const initials = member?.initials ?? email.slice(0, 2).toUpperCase();

  return (
    <div className="flex h-screen bg-gray-50">
      {/* EOS Sidebar */}
      <aside className="hidden md:flex md:w-56 md:flex-col bg-white border-r border-gray-200">
        {/* Header */}
        <div className="flex flex-col px-4 py-4 border-b border-gray-200">
          <span className="font-serif text-sm font-bold tracking-widest uppercase text-green-600">
            High Bank
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span className="font-serif text-lg font-bold tracking-wide text-gray-900">EOS</span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase bg-green-600 text-white">
              L10
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-0.5 overflow-y-auto">
          <EosNavLink href="/eos" label="Dashboard" emoji="🏠" />
          <EosNavLink href="/eos/scorecard" label="Scorecard" emoji="📊" />
          <EosNavLink href="/eos/barrels" label="Barrels" emoji="🎯" />
          <EosNavLink href="/eos/todos" label="To-Dos" emoji="✅" />
          <EosNavLink href="/eos/opportunities" label="Opportunities" emoji="💡" />
          <EosNavLink href="/eos/headlines" label="Headlines" emoji="📰" />
          <EosNavLink
            href={activeMeetingId ? `/eos/meetings/${activeMeetingId}/run` : '/eos/meetings'}
            label="Meetings"
            emoji="🤝"
            activeDot={!!activeMeetingId}
          />
        </nav>

        {/* User info + footer */}
        <div className="p-3 space-y-2 border-t border-gray-200">
          {/* User card */}
          <div className="flex items-center gap-2.5 px-2 py-2">
            <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold bg-green-600 text-white">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate text-gray-900">{displayName}</p>
              {admin ? (
                <span className="inline-block text-[9px] font-bold tracking-wider uppercase rounded-full px-2 py-0.5 mt-0.5 bg-green-600 text-white">
                  Admin
                </span>
              ) : (
                <span className="inline-block text-[9px] font-bold tracking-wider uppercase rounded px-1 py-0.5 mt-0.5 bg-gray-100 text-gray-500 border border-gray-200">
                  EOS User
                </span>
              )}
            </div>
          </div>

          {/* Back to CRM — admins only */}
          {admin && (
            <Link
              href="/"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-gray-400 hover:text-gray-600 transition-colors hover:bg-gray-100"
            >
              <span>←</span>
              <span>Back to CRM</span>
            </Link>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-gray-50 relative">
        {children}
      </main>
    </div>
  );
}

function EosNavLink({ href, label, emoji, activeDot }: {
  href: string;
  label: string;
  emoji: string;
  activeDot?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors text-gray-500 hover:bg-gray-100 hover:text-gray-900"
    >
      <span className="text-base leading-none">{emoji}</span>
      <span className="flex-1">{label}</span>
      {activeDot && (
        <span className="flex items-center gap-1 shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-600 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-600" />
          </span>
          <span className="text-[10px] text-green-600 font-medium">Live</span>
        </span>
      )}
    </Link>
  );
}
