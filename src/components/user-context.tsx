'use client';

import { createContext, useContext, ReactNode } from 'react';
import { Profile } from '@/lib/types';

export interface UserContextValue {
  profile: Profile | null;
  isAdmin: boolean;
  isApproved: boolean;
  isSuperAdmin: boolean;
}

const UserContext = createContext<UserContextValue>({
  profile: null,
  isAdmin: false,
  isApproved: false,
  isSuperAdmin: false,
});

export function UserProvider({
  value,
  children,
}: {
  value: UserContextValue;
  children: ReactNode;
}) {
  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUserContext() {
  return useContext(UserContext);
}
