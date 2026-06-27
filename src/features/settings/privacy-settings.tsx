import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/form';
import { Card, Divider, EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { DriveSettings } from '@/features/settings/drive-settings';
import { exportCoachReport } from '@/lib/report';
import { useStore } from '@/lib/store';

function ConsentRow({
  labelKey,
  value,
  onToggle,
  grantLabel,
  revokeLabel,
  notSetLabel,
  grantedLabel,
  declinedLabel,
}: {
  labelKey: string;
  value?: boolean;
  onToggle: (v: boolean) => void;
  grantLabel: string;
  revokeLabel: string;
  notSetLabel: string;
  grantedLabel: string;
  declinedLabel: string;
}) {
  return (
    <View style={styles.consentRow}>
      <View style={styles.consentLabel}>
        <ThemedText type="mono" themeColor="textSecondary">
          {labelKey}
        </ThemedText>
        <ThemedText type="monoSm" themeColor={value ? 'signalGood' : 'textMuted'}>
          {value === undefined ? notSetLabel : value ? grantedLabel : declinedLabel}
        </ThemedText>
      </View>
      <View style={styles.consentToggle}>
        {value !== true && (
          <ThemedText type="monoSm" themeColor="textSecondary" onPress={() => onToggle(true)} style={styles.link}>
            {grantLabel}
          </ThemedText>
        )}
        {value === true && (
          <ThemedText type="monoSm" themeColor="signalBad" onPress={() => onToggle(false)} style={styles.link}>
            {revokeLabel}
          </ThemedText>
        )}
      </View>
    </View>
  );
}

/**
 * Privacy & data controls (spec 11 — GDPR / BIPA / app-store policy).
 * - View current consent status; re-open consent UX to change.
 * - Export all personal data as JSON.
 * - Delete all local data (account delete lands with M1 cloud auth).
 */
export function PrivacySettings() {
  const { t, i18n } = useTranslation();
  const { profile, photos, entries, symptomEvents, doseEvents, protocolItems, inventory, setProfile, resetStore, exportState } = useStore();
  const [exporting, setExporting] = useState(false);
  const [reporting, setReporting] = useState(false);

  // ── Consent toggles ──────────────────────────────────────────────────────

  const toggleConsent = (key: 'consentPhotoStorage' | 'consentPhotoAI' | 'consentCommunity', value: boolean) => {
    setProfile({ [key]: value, consentTimestamp: new Date().toISOString() });
  };

  // ── Data export ──────────────────────────────────────────────────────────

  const exportData = async () => {
    setExporting(true);
    try {
      const data = {
        exportedAt: new Date().toISOString(),
        profile,
        checkIns: entries,
        symptoms: symptomEvents,
        doses: doseEvents,
        protocols: protocolItems,
        inventory,
        photos: photos.map(({ uri: _uri, ...rest }) => rest), // strip local URIs — paths aren't portable
      };
      const json = JSON.stringify(data, null, 2);
      const dest = new File(Paths.cache, `pepi-export-${Date.now()}.json`);
      await dest.create();
      dest.write(json);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(dest.uri, { mimeType: 'application/json', dialogTitle: t('privacy.exportTitle') });
      }
    } catch {
      Alert.alert(t('privacy.exportError'));
    } finally {
      setExporting(false);
    }
  };

  // ── Coach/doctor report (PDF) ────────────────────────────────────────────

  const exportReport = async () => {
    setReporting(true);
    try {
      await exportCoachReport(exportState(), i18n.language);
    } catch {
      Alert.alert(t('privacy.exportError'));
    } finally {
      setReporting(false);
    }
  };

  // ── Delete all data ──────────────────────────────────────────────────────

  const deleteAll = () => {
    Alert.alert(
      t('privacy.deleteTitle'),
      t('privacy.deleteBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('privacy.deleteConfirm'),
          style: 'destructive',
          onPress: () => resetStore(),
        },
      ],
    );
  };

  const consentRowProps = {
    grantLabel: t('privacy.grant'),
    revokeLabel: t('privacy.revoke'),
    notSetLabel: t('privacy.notSet'),
    grantedLabel: t('privacy.granted'),
    declinedLabel: t('privacy.declined'),
  };

  return (
    <View style={styles.wrap}>
      {/* Account / cloud sync is promoted to its own Settings row (P-01). */}

      {/* Consent status */}
      <Card style={styles.section}>
        <EngravedLabel>{t('privacy.consentSection')}</EngravedLabel>
        <ConsentRow
          {...consentRowProps}
          labelKey={t('privacy.consentStorage')}
          value={profile.consentPhotoStorage}
          onToggle={(v) => toggleConsent('consentPhotoStorage', v)}
        />
        <Divider />
        <ConsentRow
          {...consentRowProps}
          labelKey={t('privacy.consentAI')}
          value={profile.consentPhotoAI}
          onToggle={(v) => toggleConsent('consentPhotoAI', v)}
        />
        <Divider />
        <ConsentRow
          {...consentRowProps}
          labelKey={t('privacy.consentCommunity')}
          value={profile.consentCommunity}
          onToggle={(v) => toggleConsent('consentCommunity', v)}
        />
        {profile.consentTimestamp && (
          <ThemedText type="monoSm" themeColor="textMuted">
            {t('privacy.lastUpdated', { date: new Date(profile.consentTimestamp).toLocaleDateString() })}
          </ThemedText>
        )}
      </Card>

      {/* Data portability */}
      <Card style={styles.section}>
        <EngravedLabel>{t('privacy.dataSection')}</EngravedLabel>
        <ThemedText type="monoSm" themeColor="textSecondary">
          {t('privacy.exportBody')}
        </ThemedText>
        <PrimaryButton
          label={exporting ? t('privacy.exporting') : t('privacy.export')}
          onPress={exportData}
          disabled={exporting}
        />
        <ThemedText type="monoSm" themeColor="textSecondary">
          {t('report.body')}
        </ThemedText>
        <PrimaryButton
          label={reporting ? t('privacy.exporting') : t('report.export')}
          onPress={exportReport}
          disabled={reporting}
        />
      </Card>

      {/* Google Drive backup */}
      <Card style={styles.section}>
        <DriveSettings />
      </Card>

      {/* Account delete */}
      <Card style={styles.section}>
        <EngravedLabel>{t('privacy.deleteSection')}</EngravedLabel>
        <ThemedText type="monoSm" themeColor="textSecondary">
          {t('privacy.deleteBody')}
        </ThemedText>
        <PrimaryButton label={t('privacy.delete')} onPress={deleteAll} />
      </Card>

      {/* Legal */}
      <ThemedText type="monoSm" themeColor="textMuted" style={styles.legal}>
        {t('privacy.notMedicalAdvice')}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.three },
  section: { gap: Spacing.two, padding: Spacing.three },
  consentRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  consentLabel: { flex: 1, gap: 2 },
  consentToggle: { alignItems: 'flex-end' },
  link: { textDecorationLine: 'underline' },
  legal: { lineHeight: 18, paddingBottom: Spacing.four },
});
