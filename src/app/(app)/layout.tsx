import { Sidebar } from '@/components/sidebar';
import { BottomNav } from '@/components/bottom-nav';
import { TopBar } from '@/components/top-bar';
import { UserProvider } from '@/components/user-context';
import { createClient } from '@/lib/supabase/server';
import { Profile } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Fetch the user profile + admin status on the server on every request.
  // This avoids relying on the client-side Supabase session (which can be
  // stale on desktop when the JWT is cached before the admin role was set).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: Profile | null = null;
  let isAdmin = false;

  if (user) {
    const [profileRes, adminRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.rpc('is_admin'),
    ]);

    if (profileRes.error) {
      console.error('[AppLayout] profile fetch failed', profileRes.error);
    }
    profile = (profileRes.data as Profile | null) ?? null;

    if (adminRes.error) {
      console.error('[AppLayout] is_admin rpc failed', adminRes.error);
    }
    isAdmin = adminRes.data === true || profile?.role === 'admin';
  }

  const isApproved = isAdmin || profile?.role === 'rep';

  return (
    <UserProvider value={{ profile, isAdmin, isApproved }}>
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-y-auto pb-24 md:pb-0">
            {children}
          </main>
        </div>
      </div>
      <BottomNav />
    </UserProvider>
  );
}
