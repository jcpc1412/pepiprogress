import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Switch, View } from 'react-native';

import { PrimaryButton, SecondaryButton } from '@/components/form';
import { Card, Divider, EngravedLabel } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { DriveSettings } from '@/features/settings/drive-settings';
import { useAuth } from '@/lib/auth';
import { planFor } from '@/lib/photo-rescore';
import { runRescore, type RescoreProgress } from '@/lib/photo-rescore-runner';
import { exportCoachReport } from '@/lib/report';
import { useStore } from '@/lib/store';

/** A labelled switch for the share-card watermark prefs (W6-27). */
function WatermarkRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.watermarkRow}>
      <ThemedText type="mono" themeColor="textSecondary" style={styles.watermarkLabel}>
        {label}
      </ThemedText>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: theme.signalGood, false: theme.border }} />
    </View>
  );
}

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
  const { profile, photos, entries, symptomEvents, doseEvents, protocolItems, inventory, setProfile, resetStore, exportState, updatePhoto } = useStore();
  const { user } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [reporting, setReporting] = useState(false);

  // ── Retroactive photo re-scoring ─────────────────────────────────────────
  // A stored score is frozen at capture, so a scoring improvement leaves older
  // photos on the old number. That is not only cosmetic: the score decides the
  // working reference every future shot is matched against.
  const [rescoring, setRescoring] = useState<RescoreProgress | null>(null);
  const [rescoreNote, setRescoreNote] = useState<string | null>(null);
  const plan = useMemo(() => planFor(photos), [photos]);

  const startRescore = async (skipFit: boolean) => {
    if (rescoring) return;
    setRescoreNote(null);
    setRescoring({ done: 0, total: plan.work.length });
    try {
      const summary = await runRescore({
        photos,
        skipFit,
        userId: user?.id,
        // Applied per photo, so an interrupted run keeps what it already paid for.
        onPatch: (id, patch) => updatePhoto(id, patch),
        onProgress: setRescoring,
      });
      setRescoreNote(
        [
          t('rescore.doneMsg', { count: summary.rescored }),
          summary.skipped > 0 ? t('rescore.skipped', { count: summary.skipped }) : null,
        ]
          .filter(Boolean)
          .join(' '),
      );
    } finally {
      setRescoring(null);
    }
  };

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
        {/* Transition tracking (beta-notes §1.9): say clearly what is stored
            where, shown only when it applies. */}
        {profile.goals.includes('gender_transition') && (
          <ThemedText type="monoSm" themeColor="textMuted" style={styles.transitionNote}>
            {t('privacy.transitionDataNote')}
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

      {/* Retroactive photo re-scoring */}
      <Card style={styles.section}>
        <EngravedLabel>{t('rescore.section')}</EngravedLabel>
        <ThemedText type="monoSm" themeColor="textSecondary">
          {t('rescore.body')}
        </ThemedText>
        {rescoring ? (
          <ThemedText type="monoSm" themeColor="accent">
            {t('rescore.running', { done: rescoring.done, total: rescoring.total })}
          </ThemedText>
        ) : plan.work.length === 0 ? (
          <ThemedText type="monoSm" themeColor="textMuted">
            {t('rescore.upToDate', { count: photos.length })}
          </ThemedText>
        ) : (
          <>
            <ThemedText type="monoSm" themeColor="textSecondary">
              {t('rescore.pending', { count: plan.work.length })}
            </ThemedText>
            {/* The AI cost is stated before it is spent, and the free half is
                offered on its own so it is never bundled into the paid one. */}
            {plan.fitCount > 0 && (
              <ThemedText type="monoSm" themeColor="textMuted">
                {t('rescore.cost', { count: plan.fitCount })}
              </ThemedText>
            )}
            {/* Only offered when it would change something: after a free pass
                the remaining photos need the AI check, and re-running the free
                one on them would rewrite identical numbers. */}
            {plan.freeCount > 0 && (
              <PrimaryButton
                label={t('rescore.freeOnly', { count: plan.freeCount })}
                onPress={() => void startRescore(true)}
              />
            )}
            {plan.fitCount > 0 && (
              <SecondaryButton
                label={t('rescore.withFit', { count: plan.fitCount })}
                onPress={() => void startRescore(false)}
              />
            )}
          </>
        )}
        {rescoreNote && (
          <ThemedText type="monoSm" themeColor="accent">
            {rescoreNote}
          </ThemedText>
        )}
      </Card>

      {/* Share-card branding (W6-27) */}
      <Card style={styles.section}>
        <EngravedLabel>{t('share.settingsSection')}</EngravedLabel>
        <ThemedText type="monoSm" themeColor="textSecondary">
          {t('share.settingsBody')}
        </ThemedText>
        <Divider />
        <WatermarkRow
          label={t('share.watermarkCard')}
          value={profile.watermarkStatCard ?? true}
          onChange={(v) => setProfile({ watermarkStatCard: v })}
        />
        <WatermarkRow
          label={t('share.watermarkPhoto')}
          value={profile.watermarkPhoto ?? false}
          onChange={(v) => setProfile({ watermarkPhoto: v })}
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
  watermarkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three },
  watermarkLabel: { flex: 1 },
  link: { textDecorationLine: 'underline' },
  legal: { lineHeight: 18, paddingBottom: Spacing.four },
  transitionNote: { fontStyle: 'italic' },
});
