import type { Session, User } from '@supabase/supabase-js';
import { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
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
import { Platform } from 'react-native';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
// Native Google Sign-In is web/Expo-Go incompatible (it needs the linked native
// module) and pointless without a configured web client (the id token's
// audience Supabase verifies against). Falls back to the existing browser-OAuth
// path (signInWithProvider('google')) in both cases.
const googleNativeConfigured = Platform.OS !== 'web' && !!GOOGLE_WEB_CLIENT_ID;
if (googleNativeConfigured) {
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
  });
}

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
  /** Native Apple Sign In (iOS only) via expo-apple-authentication + Supabase
   *  id-token exchange. Resolves true once a session is set, false if cancelled. */
  signInWithApple: () => Promise<boolean>;
  /** True when the native Apple button should be shown (iOS + module available). */
  appleAuthAvailable: boolean;
  /** Native Google Sign In via @react-native-google-signin + Supabase id-token
   *  exchange. Resolves true once a session is set, false if cancelled. */
  signInWithGoogle: () => Promise<boolean>;
  /** True when the native Google button should be shown (mobile + web client configured). */
  googleAuthAvailable: boolean;
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

  // Native Apple Sign In (iOS). Apple returns an identity token we hand to
  // Supabase's id-token flow — no browser round-trip. Android/web fall back to
  // the browser OAuth path via signInWithProvider('apple').
  const signInWithApple = useCallback(async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) throw new Error('No identity token returned from Apple');
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (error) throw error;
      return true; // session lands via onAuthStateChange
    } catch (err) {
      // The user tapping "Cancel" on the Apple sheet is not an error.
      if (err && typeof err === 'object' && 'code' in err && err.code === 'ERR_REQUEST_CANCELED') {
        return false;
      }
      throw err;
    }
  }, []);

  // Native Google Sign In (iOS/Android). Mirrors signInWithApple: exchange the
  // provider's id token for a Supabase session, no browser round-trip. Web
  // (and any build where the web client isn't configured) falls back to the
  // browser OAuth path via signInWithProvider('google').
  const signInWithGoogle = useCallback(async () => {
    if (!googleNativeConfigured) throw new Error('Google native sign-in is not configured');
    try {
      if (Platform.OS === 'android') await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) return false; // user cancelled
      const idToken = response.data.idToken;
      if (!idToken) throw new Error('No identity token returned from Google');
      const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
      if (error) throw error;
      return true; // session lands via onAuthStateChange
    } catch (err) {
      if (isErrorWithCode(err) && err.code === statusCodes.SIGN_IN_CANCELLED) return false;
      throw err;
    }
  }, []);

  const signOut = useCallback(async () => {
    // Best-effort: only relevant when the last sign-in was native Google.
    if (googleNativeConfigured) await GoogleSignin.signOut().catch(() => {});
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  // Native Apple button: iOS only, and only when the module is actually linked
  // (a bare Expo Go / web bundle has the JS stub but no native support).
  const [appleAuthAvailable, setAppleAuthAvailable] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let active = true;
    AppleAuthentication.isAvailableAsync()
      .then((ok) => active && setAppleAuthAvailable(ok))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      initializing,
      signInWithPassword,
      signUp,
      signInWithProvider,
      signInWithApple,
      appleAuthAvailable,
      signInWithGoogle,
      googleAuthAvailable: googleNativeConfigured,
      signOut,
    }),
    [
      session,
      initializing,
      signInWithPassword,
      signUp,
      signInWithProvider,
      signInWithApple,
      appleAuthAvailable,
      signInWithGoogle,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
