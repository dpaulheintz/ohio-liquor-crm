import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { isEosAdmin } from '@/lib/eos-auth';
import EosFab from '@/components/eos/EosFab';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'EOS | High Bank' };

export default async function EosLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !isEosAdmin(user.email)) {
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

  return (
    <div className="flex h-screen bg-[#0f1a14]">
      {/* EOS Sidebar */}
      <aside className="hidden md:flex md:w-56 md:flex-col border-r border-[#2a4a35]" style={{ background: '#1a3a2a' }}>
        {/* Header */}
        <div className="flex flex-col px-4 py-4 border-b border-[#2a4a35]">
          <span className="font-serif text-sm font-bold tracking-widest uppercase text-[#a8d5b8]">
            High Bank
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span className="font-serif text-lg font-bold text-white tracking-wide">EOS</span>
            <span className="rounded px-1.5 py-0.5 text-[10px] font-bold tracking-widest uppercase" style={{ background: '#C5A572', color: '#000' }}>
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

        {/* Back to CRM */}
        <div className="border-t border-[#2a4a35] p-3">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-xs text-[#7aad8e] hover:text-white hover:bg-[#2a4a35] transition-colors"
          >
            <span>←</span>
            <span>Back to CRM</span>
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-[#0a0a0a] relative">
        {children}
        <EosFab />
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
      className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors text-[#a8d5b8] hover:bg-[#2a4a35] hover:text-white"
    >
      <span className="text-base leading-none">{emoji}</span>
      <span className="flex-1">{label}</span>
      {activeDot && (
        <span className="flex items-center gap-1 shrink-0">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          <span className="text-[10px] text-green-400 font-medium">Live</span>
        </span>
      )}
    </Link>
  );
}
