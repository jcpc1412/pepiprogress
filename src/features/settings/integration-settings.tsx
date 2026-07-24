import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton, TextButton } from '@/components/form';
import { Card, Divider, EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { buildBodySamples, hashSamples } from '@/lib/integrations/health-writeback';
import { availableProviders } from '@/lib/integrations/registry';
import type { IntegrationProvider, ProviderId } from '@/lib/integrations/types';
import { useStore } from '@/lib/store';

type ImportRange = 'lastYear' | 'allTime' | 'skip';

function ImportRangeModal({
  visible,
  providerId,
  onSelect,
}: {
  visible: boolean;
  providerId: ProviderId | null;
  onSelect: (range: ImportRange) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  if (!visible) return null;
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={[importStyles.backdrop, { backgroundColor: 'rgba(0,0,0,0.7)' }]}>
        <SafeAreaView edges={['bottom']} style={importStyles.sheet}>
          <View style={[importStyles.card, { backgroundColor: theme.backgroundElement }]}>
            <ThemedText type="smallBold">{t('integrations.importTitle')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('integrations.importSubtitle')}
            </ThemedText>
            <View style={importStyles.actions}>
              <PrimaryButton label={t('integrations.importLastYear')} onPress={() => onSelect('lastYear')} />
              <TextButton label={t('integrations.importAllTime')} onPress={() => onSelect('allTime')} />
              <TextButton label={t('integrations.importSkip')} onPress={() => onSelect('skip')} />
            </View>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const importStyles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { padding: Spacing.four },
  card: { borderRadius: 12, padding: Spacing.four, gap: Spacing.three },
  actions: { gap: Spacing.two },
});

function ProviderRow({ provider }: { provider: IntegrationProvider }) {
  const { t } = useTranslation();
  const { integrations, setIntegration, addMetricReadings, entries, profile } = useStore();
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [diagReport, setDiagReport] = useState<string | null>(null);
  const [diagBusy, setDiagBusy] = useState(false);
  const conn = integrations[provider.id];
  const connected = !!conn?.connectedAt;

  const handleImport = async (range: ImportRange) => {
    setShowImport(false);
    if (range === 'skip') return;
    setBusy(true);
    try {
      // Both providers treat a missing `since` as "first background sync" and fall
      // back to 30 days, so passing undefined for 'allTime' silently imported one
      // month. Pass an explicit far-back date instead: "all time" has to mean it.
      const since =
        range === 'lastYear'
          ? new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()
          : new Date(Date.now() - 20 * 365 * 24 * 60 * 60 * 1000).toISOString();
      const readings = await provider.pull({ since, connection: conn });
      addMetricReadings(readings);
      setSyncResult(t('integrations.imported', { count: readings.length }));
      setIntegration(provider.id, { lastSyncAt: new Date().toISOString() });
    } finally {
      setBusy(false);
    }
  };

  const runDiagnostics = async () => {
    if (!provider.diagnose) return;
    setDiagBusy(true);
    setDiagReport(null);
    try {
      setDiagReport(await provider.diagnose());
    } catch (e) {
      setDiagReport(e instanceof Error ? e.message : String(e));
    } finally {
      setDiagBusy(false);
    }
  };

  const connect = async () => {
    setBusy(true);
    setConnectError(null);
    try {
      const { ok, patch, error } = await provider.authenticate();
      if (ok) {
        setIntegration(provider.id, { connectedAt: new Date().toISOString(), ...patch });
        setShowImport(true);
      } else if (error) {
        setConnectError(error);
      }
    } catch (e) {
      // A missing/unavailable native module (e.g. Health Connect not installed)
      // must surface as an error, never crash the app (B3-03).
      setConnectError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    setBusy(true);
    try {
      const readings = await provider.pull({ since: conn?.lastSyncAt, connection: conn });
      addMetricReadings(readings);
      setSyncResult(t('integrations.imported', { count: readings.length }));
      setIntegration(provider.id, { lastSyncAt: new Date().toISOString() });
    } catch (e) {
      setSyncResult(t('integrations.connectError', { reason: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () =>
    setIntegration(provider.id, { connectedAt: undefined, lastSyncAt: undefined, writeEnabled: false });

  // Toggle write-back. Enabling seeds per-day hashes from the CURRENT check-ins so
  // only days logged/edited afterwards mirror to Health — existing data (which may
  // have been imported *from* Health) is never echoed back as duplicates.
  const setWriteEnabled = (on: boolean) => {
    if (on) {
      const writtenHashes: Record<string, string> = {};
      for (const c of Object.values(entries)) {
        const samples = buildBodySamples(c, profile);
        if (samples.length) writtenHashes[c.date] = hashSamples(samples);
      }
      setIntegration(provider.id, { writeEnabled: true, writtenHashes });
    } else {
      setIntegration(provider.id, { writeEnabled: false });
    }
  };

  return (
    <>
      <ImportRangeModal visible={showImport} providerId={provider.id} onSelect={handleImport} />
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
          {syncResult && (
            <ThemedText type="monoSm" themeColor="textSecondary">
              {syncResult}
            </ThemedText>
          )}
          <View style={styles.actionLinks}>
            <Pressable accessibilityRole="button" onPress={sync} disabled={busy}>
              <ThemedText type="monoSm" themeColor="textSecondary" style={styles.link}>
                {busy ? t('integrations.syncing') : t('integrations.sync')}
              </ThemedText>
            </Pressable>
            {provider.diagnose && (
              <Pressable accessibilityRole="button" onPress={runDiagnostics} disabled={diagBusy}>
                <ThemedText type="monoSm" themeColor="textSecondary" style={styles.link}>
                  {diagBusy ? t('integrations.diagnosing') : t('integrations.diagnose')}
                </ThemedText>
              </Pressable>
            )}
            <Pressable accessibilityRole="button" onPress={disconnect} disabled={busy}>
              <ThemedText type="monoSm" themeColor="signalBad" style={styles.link}>
                {t('integrations.disconnect')}
              </ThemedText>
            </Pressable>
          </View>
          {diagReport && (
            <View style={styles.diagBox}>
              <ThemedText type="monoSm" themeColor="textMuted" selectable>
                {diagReport}
              </ThemedText>
            </View>
          )}
          {/* Write-back: mirror weight / body-fat % / waist into the store. */}
          {provider.push && (
            <View style={styles.writeBack}>
              <View style={styles.writeRow}>
                <ThemedText type="mono" themeColor="textSecondary" style={styles.writeLabel}>
                  {t('integrations.writeBack')}
                </ThemedText>
                <Switch
                  value={!!conn?.writeEnabled}
                  onValueChange={setWriteEnabled}
                  trackColor={{ true: theme.signalGood, false: theme.border }}
                />
              </View>
              <ThemedText type="monoSm" themeColor="textMuted">
                {/* Only promise what this store can actually hold. */}
                {t(
                  provider.writeMetrics?.includes('body.waist')
                    ? 'integrations.writeBackHint'
                    : 'integrations.writeBackHintNoWaist',
                )}
              </ThemedText>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={connect} disabled={busy}>
            <ThemedText type="monoSm" themeColor="textSecondary" style={styles.link}>
              {busy ? t('integrations.connecting') : t('integrations.connect')}
            </ThemedText>
          </Pressable>
          {connectError && (
            <ThemedText type="monoSm" themeColor="signalBad">
              {t('integrations.connectError', { reason: connectError })}
            </ThemedText>
          )}
        </View>
      )}
      </View>
    </>
  );
}

/** Data-source connections (spec 06). Lists providers available on this platform;
 * each can connect + sync, ingesting canonical readings into the store. */
export function IntegrationSettings() {
  const { t } = useTranslation();
  // Terra is hidden until it's actually implemented (redesign R3).
  const providers = availableProviders().filter((p) => p.id !== 'terra');

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
  diagBox: { marginTop: Spacing.one, paddingVertical: Spacing.two },
  writeBack: { marginTop: Spacing.two, gap: Spacing.half },
  writeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  writeLabel: { flex: 1 },
});
