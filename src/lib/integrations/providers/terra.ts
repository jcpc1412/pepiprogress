import * as WebBrowser from 'expo-web-browser';

import {
  CanonicalMetric,
  type AuthResult,
  type IntegrationProvider,
  type ProviderReading,
} from '@/lib/integrations/types';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { IntegrationState } from '@/lib/store';

const PROVIDER_ID = 'terra';
const REDIRECT = 'pepi://terra';

/**
 * Terra aggregator (spec 06, Tier 0). Wraps Garmin, Fitbit, Whoop, Oura, Polar,
 * Withings, Dexcom, Cronometer, etc. behind a single Connect widget. Cross-platform
 * because Terra hosts OAuth + the data pull server-side.
 *
 * Credentials (TERRA_DEV_ID, TERRA_API_KEY) live in Supabase edge-function secrets,
 * NOT the client — the `ai-service` edge function proxies both the widget-session
 * creation and the data pull (action: 'terra'). The client only ever holds the
 * Terra-issued `terraUserId`.
 *
 * Readiness is gated on EXPO_PUBLIC_TERRA_ENABLED so the owner flips it on once the
 * edge secrets are set; until then the row shows "coming soon" (no failed taps).
 */
const ENABLED = process.env.EXPO_PUBLIC_TERRA_ENABLED === 'true' && isSupabaseConfigured;

/** Open the Connect widget; capture the Terra user id from the redirect. */
async function authenticate(): Promise<AuthResult> {
  if (!isSupabaseConfigured) return { ok: false };
  const { data, error } = await supabase.functions.invoke<{ url: string }>('ai-service', {
    body: { action: 'terra', sub: 'widget_session', redirectUrl: REDIRECT },
  });
  if (error || !data?.url) return { ok: false };

  const result = await WebBrowser.openAuthSessionAsync(data.url, REDIRECT);
  if (result.type !== 'success' || !result.url) return { ok: false };

  // Terra appends ?user_id=...&reference_id=... to the success redirect.
  const userId = new URL(result.url).searchParams.get('user_id');
  if (!userId) return { ok: false };
  return { ok: true, patch: { terraUserId: userId } };
}

/** Pull readings via the edge proxy; mapping to canonical metrics happens server-side. */
async function pull({
  since,
  connection,
}: {
  since?: string;
  connection?: IntegrationState;
}): Promise<ProviderReading[]> {
  const userId = connection?.terraUserId;
  if (!userId || !isSupabaseConfigured) return [];
  const { data, error } = await supabase.functions.invoke<{ readings: ProviderReading[] }>(
    'ai-service',
    { body: { action: 'terra', sub: 'pull', userId, since } },
  );
  if (error || !data?.readings) return [];
  return data.readings;
}

export const terraProvider: IntegrationProvider = {
  id: PROVIDER_ID,
  nameKey: 'integrations.terra',
  capabilities: [
    CanonicalMetric.bodyWeight,
    CanonicalMetric.bodyFatPct,
    CanonicalMetric.bodyLeanMass,
    CanonicalMetric.activitySteps,
    CanonicalMetric.activityEnergy,
    CanonicalMetric.activityEffort,
    CanonicalMetric.sleepDuration,
    CanonicalMetric.sleepQuality,
    CanonicalMetric.vitalsHrRest,
    CanonicalMetric.vitalsHrv,
  ],
  isAvailable: () => true,
  nativeReady: ENABLED,
  authenticate,
  pull,
};
