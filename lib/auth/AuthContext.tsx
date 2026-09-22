'use client';

import { createContext, useContext, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { CognitoGroup } from './cognito/groups';

export type AuthUser = {
  email?: string;
  groups: CognitoGroup[];
  id: string;
};

interface AuthContextType {
  user: AuthUser | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type AuthProviderProps = {
  children: React.ReactNode;
  initialUser?: AuthUser | null;
};

export function AuthProvider({
  children,
  initialUser = null,
}: AuthProviderProps) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(initialUser);

  const signOut = async () => {
    const response = await fetch('/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('No s’ha pogut tancar la sessió.');
    setUser(null);
    router.replace('/');
    router.refresh();
  };

  return (
    <AuthContext.Provider value={{ user, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
