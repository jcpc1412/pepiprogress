import type { Session, User } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

type AuthContextValue = {
  /** Current session, or null when signed out. `undefined` only before the first restore. */
  session: Session | null;
  user: User | null;
  /** True until the persisted session has been restored on launch. */
  initializing: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, locale?: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Wraps the app with Supabase session state. Restores the persisted session on
 * launch and keeps it live via onAuthStateChange (token refresh, sign-in/out).
 * OAuth providers + the anonymous→account migration (spec 10) layer on top of
 * this once the local-first store spike lands.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  // When Supabase isn't configured there's nothing to restore, so we're not initializing.
  const [initializing, setInitializing] = useState(isSupabaseConfigured);

  useEffect(() => {
    // Local-first with no credentials yet: nothing to restore, don't call out.
    if (!isSupabaseConfigured) return;

    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setInitializing(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string, locale?: string) => {
    // locale is stored in user metadata; handle_new_user() seeds user_profile.locale from it.
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: locale ? { data: { locale } } : undefined,
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      initializing,
      signInWithPassword,
      signUp,
      signOut,
    }),
    [session, initializing, signInWithPassword, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
