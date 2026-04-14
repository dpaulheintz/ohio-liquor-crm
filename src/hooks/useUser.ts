'use client';

import { createClient } from '@/lib/supabase/client';
import { Profile } from '@/lib/types';
import { useEffect, useState } from 'react';

export function useUser() {
  const [profile, setProfile] = useState<Profile | null>(null);
  // Independent admin signal sourced from the SECURITY DEFINER is_admin() RPC.
  // This bypasses any RLS issues on the profiles table, so the sidebar/bottom
  // nav can still reveal admin controls even when the profiles SELECT fails.
  const [isAdminRpc, setIsAdminRpc] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function loadProfileAndAdmin(userId: string) {
      const [profileRes, adminRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        supabase.rpc('is_admin'),
      ]);

      if (profileRes.error) {
        console.error('[useUser] profile fetch failed:', profileRes.error);
      }
      setProfile(profileRes.data ?? null);

      if (adminRes.error) {
        console.error('[useUser] is_admin rpc failed:', adminRes.error);
        setIsAdminRpc(false);
      } else {
        setIsAdminRpc(adminRes.data === true);
      }
    }

    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await loadProfileAndAdmin(user.id);
      } else {
        setProfile(null);
        setIsAdminRpc(false);
      }
      setLoading(false);
    }

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          await loadProfileAndAdmin(session.user.id);
        } else {
          setProfile(null);
          setIsAdminRpc(false);
        }
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Admin is true if EITHER the profile row says admin OR the RPC says admin.
  // Using OR means a stale RLS-denied profile fetch doesn't hide admin UI.
  const isAdmin = isAdminRpc || profile?.role === 'admin';
  const isApproved = isAdmin || profile?.role === 'rep';

  return {
    profile,
    loading,
    isAdmin,
    isApproved,
  };
}
