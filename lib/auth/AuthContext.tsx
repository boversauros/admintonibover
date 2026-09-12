'use client';

import { createContext, useContext, useState } from 'react';

export type AuthUser = {
  email?: string;
  id: string;
};

interface AuthContextType {
  user: AuthUser | null;
  signIn: () => void;
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
  const [user, setUser] = useState<AuthUser | null>(initialUser);

  const signIn = () => {
    const loginUrl = new URL('/auth/login', window.location.origin);
    const returnTo = `${window.location.pathname}${window.location.search}`;
    if (returnTo !== '/') loginUrl.searchParams.set('returnTo', returnTo);
    window.location.assign(loginUrl);
  };

  const signOut = async () => {
    const response = await fetch('/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error('Failed to sign out');
    const payload = (await response.json()) as { logoutUrl?: unknown };
    if (typeof payload.logoutUrl !== 'string') {
      throw new Error('Failed to sign out');
    }
    setUser(null);
    window.location.assign(payload.logoutUrl);
  };

  return (
    <AuthContext.Provider value={{ user, signIn, signOut }}>
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
