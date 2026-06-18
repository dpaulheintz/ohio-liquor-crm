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
    <div className="flex h-screen" style={{ background: '#0E0B07' }}>
      {/* EOS Sidebar */}
      <aside className="hidden md:flex md:w-56 md:flex-col" style={{ background: '#1C1510', borderRight: '1px solid #3D2E1E' }}>
        {/* Header */}
        <div className="flex flex-col px-4 py-4" style={{ borderBottom: '1px solid #3D2E1E' }}>
          <span className="font-serif text-sm font-bold tracking-widest uppercase" style={{ color: '#C9963A' }}>
            High Bank
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span className="font-serif text-lg font-bold tracking-wide" style={{ color: '#F5ECD7' }}>EOS</span>
            <span className="rounded px-1.5 py-0.5 text-[10px] font-bold tracking-widest uppercase" style={{ background: '#C9963A', color: '#0E0B07' }}>
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
        <div className="p-3 space-y-2" style={{ borderTop: '1px solid #3D2E1E' }}>
          {/* User card */}
          <div className="flex items-center gap-2.5 px-2 py-2">
            <div
              className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold"
              style={{ background: '#C9963A', color: '#0E0B07' }}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate" style={{ color: '#F5ECD7' }}>{displayName}</p>
              {admin ? (
                <span className="inline-block text-[9px] font-bold tracking-wider uppercase rounded px-1 py-0.5 mt-0.5" style={{ background: '#2A1F14', color: '#C9963A' }}>
                  Admin
                </span>
              ) : (
                <span className="inline-block text-[9px] font-bold tracking-wider uppercase rounded px-1 py-0.5 mt-0.5" style={{ background: '#2A1F14', color: '#B8A99A' }}>
                  EOS User
                </span>
              )}
            </div>
          </div>

          {/* Back to CRM — admins only */}
          {admin && (
            <Link
              href="/"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-xs transition-colors hover:bg-[#2A1F14]"
              style={{ color: '#B8A99A' }}
            >
              <span>←</span>
              <span>Back to CRM</span>
            </Link>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-[#0E0B07] relative">
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
      className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors hover:bg-[#2A1F14] hover:text-[#F5ECD7]"
      style={{ color: '#B8A99A' }}
    >
      <span className="text-base leading-none">{emoji}</span>
      <span className="flex-1">{label}</span>
      {activeDot && (
        <span className="flex items-center gap-1 shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#5B9E94] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#5B9E94]" />
          </span>
          <span className="text-[10px] text-[#5B9E94] font-medium">Live</span>
        </span>
      )}
    </Link>
  );
}
