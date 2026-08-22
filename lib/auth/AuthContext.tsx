'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { AdminDataBackend } from '@/lib/config/adminBackend';

export type AuthUser = {
  email?: string;
  id: string;
  user_metadata?: Record<string, unknown>;
};

type AuthSession = {
  expiresAt?: number;
  provider: AdminDataBackend;
};

interface AuthContextType {
  backend: AdminDataBackend;
  user: AuthUser | null;
  session: AuthSession | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type AuthProviderProps = {
  backend: AdminDataBackend;
  children: React.ReactNode;
  initialExpiresAt?: number;
  initialUser?: AuthUser | null;
};

export function AuthProvider({
  backend,
  children,
  initialExpiresAt,
  initialUser = null,
}: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(initialUser);
  const [session, setSession] = useState<AuthSession | null>(
    backend === 'aws' && initialUser
      ? { provider: 'aws', expiresAt: initialExpiresAt }
      : null
  );
  const [loading, setLoading] = useState(backend !== 'aws');

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    if (backend === 'aws') {
      return () => {
        active = false;
      };
    }

    void import('../supabase')
      .then(({ createClient }) => {
        const supabase = createClient();
        void supabase.auth.getSession().then(({ data: { session } }) => {
          if (!active) return;
          setSession(
            session
              ? { provider: 'supabase', expiresAt: session.expires_at }
              : null
          );
          setUser(session?.user ?? null);
          setLoading(false);
        });

        const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, nextSession) => {
          if (!active) return;
          setSession(
            nextSession
              ? {
                  provider: 'supabase',
                  expiresAt: nextSession.expires_at,
                }
              : null
          );
          setUser(nextSession?.user ?? null);
          setLoading(false);
        });
        unsubscribe = () => subscription.unsubscribe();
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [backend]);

  const signIn = async (email: string, password: string) => {
    if (backend === 'aws') {
      const loginUrl = new URL('/auth/login', window.location.origin);
      const returnTo = `${window.location.pathname}${window.location.search}`;
      if (returnTo !== '/') loginUrl.searchParams.set('returnTo', returnTo);
      window.location.assign(loginUrl);
      return;
    }

    const { createClient } = await import('../supabase');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signOut = async () => {
    if (backend === 'aws') {
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
      setSession(null);
      window.location.assign(payload.logoutUrl);
      return;
    }

    const { createClient } = await import('../supabase');
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider
      value={{ backend, user, session, loading, signIn, signOut }}
    >
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
