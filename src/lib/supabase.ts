import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Whether real Supabase credentials are present. The app is local-first and
 * auth/sync are deferred (spec 02/10), so it must run with NO credentials —
 * we don't throw on import. Cloud-dependent code paths guard on this flag.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn(
    'Supabase env not set (EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY) — running local-first without cloud auth/sync.',
  );
}

// Placeholder URL keeps createClient valid when unconfigured; no calls are made
// in that state (guarded by isSupabaseConfigured).
export const supabase = createClient<Database>(
  supabaseUrl ?? 'http://localhost:54321',
  supabaseAnonKey ?? 'anon-placeholder',
  {
    auth: {
      // AsyncStorage persists the session (localStorage on web). Secrets never touch the client.
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // RN has no URL-based session; web OAuth redirect handling is added with auth wiring.
      detectSessionInUrl: false,
    },
  },
);
