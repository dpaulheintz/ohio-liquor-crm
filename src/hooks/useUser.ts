'use client';

import { useUserContext } from '@/components/user-context';

/**
 * Returns the authenticated user's profile + admin/approved flags.
 *
 * The underlying data is server-rendered by the (app) layout on every request
 * (see src/app/(app)/layout.tsx), so this hook never depends on the client-side
 * Supabase session or client-side RLS. That means the role resolution is
 * identical across mobile and desktop — there's no cached JWT, no localStorage
 * drift, and no client-side fetch that can transiently fail.
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
