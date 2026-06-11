import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { isEosAdmin } from '@/lib/eos-auth';

export const dynamic = 'force-dynamic';

const navLinks = [
  { href: '/eos', label: 'Dashboard', emoji: '🏠', exact: true },
  { href: '/eos/scorecard', label: 'Scorecard', emoji: '📊' },
  { href: '/eos/barrels', label: 'Barrels', emoji: '🎯' },
  { href: '/eos/todos', label: 'To-Dos', emoji: '✅' },
  { href: '/eos/opportunities', label: 'Opportunities', emoji: '💡' },
  { href: '/eos/headlines', label: 'Headlines', emoji: '📰' },
  { href: '/eos/meetings', label: 'Meetings', emoji: '🤝' },
];

export default async function EosLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !isEosAdmin(user.email)) {
    redirect('/');
  }

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
          {navLinks.map((link) => (
            <EosNavLink key={link.href} {...link} />
          ))}
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
      <main className="flex-1 overflow-y-auto bg-[#0a0a0a]">
        {children}
      </main>
    </div>
  );
}

// Client nav link with active state needs pathname — use a server-safe approach
// by passing the active check via a wrapper client component
function EosNavLink({ href, label, emoji, exact }: {
  href: string;
  label: string;
  emoji: string;
  exact?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors text-[#a8d5b8] hover:bg-[#2a4a35] hover:text-white"
    >
      <span className="text-base leading-none">{emoji}</span>
      {label}
    </Link>
  );
}
