import { Sidebar } from '@/components/sidebar';
import { MobileNav } from '@/components/nav/mobile-nav';
import { VisitFab } from '@/components/nav/visit-fab';
import { TopBar } from '@/components/top-bar';
import { UserProvider } from '@/components/user-context';
import { createClient } from '@/lib/supabase/server';
import { isEosOnly } from '@/lib/eos-auth';
import { Profile } from '@/lib/types';
import { canOpenPath, navUserFromProfile } from '@/lib/nav';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && isEosOnly(user.email)) {
    redirect('/eos');
  }

  let profile: Profile | null = null;
  let isAdmin = false;

  if (user) {
    const [profileRes, adminRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.rpc('is_admin'),
    ]);

    if (profileRes.error) {
      // profile fetch failed — continue with null profile
    }
    profile = (profileRes.data as Profile | null) ?? null;
    isAdmin = adminRes.data === true || profile?.role === 'admin';
  }

  const isApproved = isAdmin || profile?.role === 'rep';
  const navUser = navUserFromProfile(profile, user?.email ?? null);

  return (
    <UserProvider value={{ profile, isAdmin, isApproved }}>
      <div className="flex h-dvh">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-y-auto pb-[calc(var(--mobile-nav-h)+5.5rem)] md:pb-0">
            {children}
          </main>
        </div>
      </div>
      <MobileNav user={navUser} name={profile?.full_name || null} />
      {canOpenPath(navUser, '/visits/new') && <VisitFab />}
    </UserProvider>
  );
}
