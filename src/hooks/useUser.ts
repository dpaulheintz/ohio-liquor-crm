'use client';

import { useUserContext } from '@/components/user-context';

/**
 * Returns the authenticated user's profile + role flags.
 *
 * The underlying data is server-rendered by the (app) layout on every request,
 * so this hook never depends on the client-side Supabase session or JWT.
 */
export function useUser() {
  const { profile, isAdmin, isApproved } = useUserContext();

  return {
    profile,
    loading: false,
    isAdmin,
    isApproved,
  };
}
