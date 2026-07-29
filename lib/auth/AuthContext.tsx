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
};

export function AuthProvider({ backend, children }: AuthProviderProps) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;

    if (backend === 'aws') {
      void fetch('/auth/session', {
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
        cache: 'no-store',
      })
        .then(async response => {
          if (!active || !response.ok) return;
          const payload = (await response.json()) as {
            expiresAt?: number;
            user?: AuthUser;
          };
          if (payload.user) {
            setUser(payload.user);
            setSession({
              provider: 'aws',
              expiresAt: payload.expiresAt,
            });
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (active) setLoading(false);
        });

      return () => {
        active = false;
      };
    }

    void import('../supabase')
      .then(({ supabase }) => {
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
      window.location.assign('/auth/login');
      return;
    }

    const { supabase } = await import('../supabase');
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signOut = async () => {
    if (backend === 'aws') {
      window.location.assign('/auth/logout');
      return;
    }

    const { supabase } = await import('../supabase');
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
