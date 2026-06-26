import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card, Divider, EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { availableProviders } from '@/lib/integrations/registry';
import type { IntegrationProvider } from '@/lib/integrations/types';
import { useStore } from '@/lib/store';

function ProviderRow({ provider }: { provider: IntegrationProvider }) {
  const { t } = useTranslation();
  const { integrations, setIntegration, addMetricReadings } = useStore();
  const [busy, setBusy] = useState(false);
  const conn = integrations[provider.id];
  const connected = !!conn?.connectedAt;

  const connect = async () => {
    setBusy(true);
    try {
      const { ok, patch } = await provider.authenticate();
      if (ok) setIntegration(provider.id, { connectedAt: new Date().toISOString(), ...patch });
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    setBusy(true);
    try {
      const readings = await provider.pull({ since: conn?.lastSyncAt, connection: conn });
      addMetricReadings(readings);
      setIntegration(provider.id, { lastSyncAt: new Date().toISOString() });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () => setIntegration(provider.id, { connectedAt: undefined, lastSyncAt: undefined });

  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <ThemedText type="smallBold">{t(provider.nameKey as never)}</ThemedText>
        <ThemedText type="monoSm" themeColor="textMuted">
          {t('integrations.provides', { count: provider.capabilities.length })}
        </ThemedText>
      </View>

      {!provider.nativeReady ? (
        <ThemedText type="monoSm" themeColor="textMuted">
          {t('integrations.comingSoon')}
        </ThemedText>
      ) : connected ? (
        <View style={styles.actions}>
          <ThemedText type="monoSm" themeColor="textSecondary">
            {conn?.lastSyncAt
              ? t('integrations.lastSync', { when: new Date(conn.lastSyncAt).toLocaleDateString() })
              : t('integrations.lastSync', { when: t('integrations.never') })}
          </ThemedText>
          <View style={styles.actionLinks}>
            <Pressable accessibilityRole="button" onPress={sync} disabled={busy}>
              <ThemedText type="monoSm" themeColor="textSecondary" style={styles.link}>
                {busy ? t('integrations.syncing') : t('integrations.sync')}
              </ThemedText>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={disconnect} disabled={busy}>
              <ThemedText type="monoSm" themeColor="signalBad" style={styles.link}>
                {t('integrations.disconnect')}
              </ThemedText>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable accessibilityRole="button" onPress={connect} disabled={busy}>
          <ThemedText type="monoSm" themeColor="textSecondary" style={styles.link}>
            {busy ? t('integrations.connecting') : t('integrations.connect')}
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

/** Data-source connections (spec 06). Lists providers available on this platform;
 * each can connect + sync, ingesting canonical readings into the store. */
export function IntegrationSettings() {
  const { t } = useTranslation();
  const providers = availableProviders();

  return (
    <Card>
      <EngravedLabel>{t('integrations.section')}</EngravedLabel>
      <Divider />
      <ThemedText type="small" themeColor="textSecondary">
        {t('integrations.description')}
      </ThemedText>
      {providers.length === 0 ? (
        <ThemedText type="monoSm" themeColor="textMuted">
          {t('integrations.empty')}
        </ThemedText>
      ) : (
        providers.map((p, i) => (
          <View key={p.id}>
            {i > 0 && <Divider />}
            <ProviderRow provider={p} />
          </View>
        ))
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { gap: Spacing.two },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: Spacing.two },
  actions: { gap: Spacing.one },
  actionLinks: { flexDirection: 'row', gap: Spacing.four },
  link: { textDecorationLine: 'underline' },
});
