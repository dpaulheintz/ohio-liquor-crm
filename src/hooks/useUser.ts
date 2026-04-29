'use client';

import { useUserContext } from '@/components/user-context';

/**
 * Returns the authenticated user's profile + role flags.
 *
 * Data is server-rendered by the (app) layout on every request — no
 * client-side Supabase session, no JWT cache drift, no localStorage.
 */
export function useUser() {
  const { profile, isAdmin, isApproved, isSuperAdmin } = useUserContext();

  return {
    profile,
    loading: false,
    isAdmin,
    isApproved,
    isSuperAdmin,
  };
}
