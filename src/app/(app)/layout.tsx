import { Sidebar } from '@/components/sidebar';
import { BottomNav } from '@/components/bottom-nav';
import { TopBar } from '@/components/top-bar';
import { ImpersonationBanner } from '@/components/impersonation-banner';
import { UserProvider } from '@/components/user-context';
import { createClient } from '@/lib/supabase/server';
import { Profile, Organization } from '@/lib/types';
import { cookies } from 'next/headers';

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

  let profile: Profile | null = null;
  let org: Organization | null = null;
  let isAdmin = false;
  let isSuperAdmin = false;

  if (user) {
    const [profileRes, adminRes, superAdminRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
      supabase.rpc('is_admin'),
      supabase.rpc('is_super_admin'),
    ]);

    if (profileRes.error) {
      console.error('[AppLayout] profile fetch failed', profileRes.error);
    }
    profile = (profileRes.data as Profile | null) ?? null;

    if (adminRes.error) {
      console.error('[AppLayout] is_admin rpc failed', adminRes.error);
    }
    isAdmin = adminRes.data === true || profile?.role === 'admin';
    isSuperAdmin = superAdminRes.data === true || profile?.is_super_admin === true;

    // Check for super-admin impersonation cookie
    const cookieStore = await cookies();
    const impersonateOrgId = cookieStore.get('sa_impersonate_org_id')?.value;
    const impersonateOrgName = cookieStore.get('sa_impersonate_org_name')?.value;

    if (isSuperAdmin && impersonateOrgId) {
      // Show the impersonated org as the active org in the UI
      org = {
        id: impersonateOrgId,
        name: impersonateOrgName ?? 'Unknown Org',
        slug: '',
        logo_url: null,
        created_at: '',
        is_active: true,
      };
    } else if (profile?.organization_id) {
      const { data: orgData } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', profile.organization_id)
        .maybeSingle();
      org = (orgData as Organization | null) ?? null;
    }
  }

  const isApproved = isAdmin || profile?.role === 'rep';
  const isImpersonating = isSuperAdmin && org !== null && org.slug === '';

  return (
    <UserProvider value={{ profile, org, isAdmin, isApproved, isSuperAdmin }}>
      {isImpersonating && <ImpersonationBanner orgName={org!.name} />}
      <div className={`flex h-screen ${isImpersonating ? 'pt-10' : ''}`}>
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
