import { appleHealthProvider } from '@/lib/integrations/providers/apple-health';
import { healthConnectProvider } from '@/lib/integrations/providers/health-connect';
import { terraProvider } from '@/lib/integrations/providers/terra';
import type { IntegrationProvider, ProviderId } from '@/lib/integrations/types';

/**
 * The provider registry (spec 06). Adding a source = appending a provider here.
 * Tier-0: Apple Health (iOS), Health Connect (Android), Terra (cross-platform).
 * Tier-1 direct adapters (Withings, Garmin, Cronometer, Hevy, etc.) are V2.
 */
const PROVIDERS: IntegrationProvider[] = [appleHealthProvider, healthConnectProvider, terraProvider];

/** All registered providers, regardless of platform availability. */
export function allProviders(): IntegrationProvider[] {
  return PROVIDERS;
}

/** Providers that can run on the current platform. */
export function availableProviders(): IntegrationProvider[] {
  return PROVIDERS.filter((p) => p.isAvailable());
}

export function getProvider(id: ProviderId): IntegrationProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
