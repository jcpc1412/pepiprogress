import type { Session, User } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
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

/** OAuth providers offered in the UI. Provider config lives in Supabase Auth. */
export type OAuthProvider = 'apple' | 'google';

/** Deep-link the OAuth flow redirects back to (app scheme `pepi`, see app.json). */
const OAUTH_REDIRECT = 'pepi://auth-callback';

type AuthContextValue = {
  /** Current session, or null when signed out. `undefined` only before the first restore. */
  session: Session | null;
  user: User | null;
  /** True until the persisted session has been restored on launch. */
  initializing: boolean;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, locale?: string) => Promise<void>;
  /** Native OAuth via the system browser; resolves true once a session is set,
   *  false if the user cancelled. Provider must be enabled in Supabase Auth. */
  signInWithProvider: (provider: OAuthProvider) => Promise<boolean>;
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

  const signInWithProvider = useCallback(async (provider: OAuthProvider) => {
    // Ask Supabase for the provider's authorize URL (PKCE), open it in the
    // system browser, then exchange the returned code for a session. The
    // provider itself is configured in the Supabase dashboard (owner rigs up).
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: OAUTH_REDIRECT, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (!data?.url) throw new Error('No OAuth URL returned');

    const result = await WebBrowser.openAuthSessionAsync(data.url, OAUTH_REDIRECT);
    if (result.type !== 'success' || !result.url) return false; // cancelled/dismissed

    const url = new URL(result.url);
    const code = url.searchParams.get('code');
    if (code) {
      const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeErr) throw exchangeErr;
      return true;
    }
    // Implicit-flow fallback: tokens in the URL fragment.
    const frag = new URLSearchParams(url.hash.replace(/^#/, ''));
    const access_token = frag.get('access_token');
    const refresh_token = frag.get('refresh_token');
    if (access_token && refresh_token) {
      const { error: sessErr } = await supabase.auth.setSession({ access_token, refresh_token });
      if (sessErr) throw sessErr;
      return true;
    }
    return false;
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
      signInWithProvider,
      signOut,
    }),
    [session, initializing, signInWithPassword, signUp, signInWithProvider, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
