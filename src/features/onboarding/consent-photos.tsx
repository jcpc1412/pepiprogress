import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Switch, View } from 'react-native';

import { PrimaryButton } from '@/components/form';
import { CameraIcon, SignalDotIcon, TargetIcon } from '@/components/icons';
import { Card, Divider } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Step 2 consent: photo storage (handoff §1 step 2).
 *  Camera glyph + 3 signalGood bullet rows + "I UNDERSTAND" button. */
export function ConsentPhotoStorage({
  onAccept,
  onDecline,
}: {
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { t } = useTranslation();

  const bullets = [
    t('consent.storage.bullet1'),
    t('consent.storage.bullet2'),
    t('consent.storage.bullet3'),
  ];

  // Three bullets and a button (onboarding review 2026-07-23). The prior screen
  // carried a body paragraph plus a long legal notice on top of these bullets;
  // nobody read either, and the length itself read as something to be wary of.
  // The full policy still lives in Settings, where someone looking for it looks.
  return (
    <View style={styles.wrap}>
      <View style={styles.glyphRow}>
        <CameraIcon size={60} color="textSecondary" />
      </View>

      <ThemedText type="display">{t('consent.storage.title')}</ThemedText>

      <Card style={styles.bulletCard}>
        {bullets.map((b, i) => (
          <View key={i}>
            {i > 0 && <Divider />}
            <View style={styles.bulletRow}>
              <SignalDotIcon size={8} color="signalGood" />
              <ThemedText type="small" style={styles.bulletText}>
                {b}
              </ThemedText>
            </View>
          </View>
        ))}
      </Card>

      <PrimaryButton label={t('consent.storage.understand')} onPress={onAccept} />

      <View style={styles.skipRow}>
        <ThemedText
          type="monoSm"
          themeColor="textSecondary"
          style={styles.skipLink}
          onPress={onDecline}>
          {t('consent.storage.decline')}
        </ThemedText>
      </View>
    </View>
  );
}

/** Step 3 consent: AI analysis (handoff §1 step 3).
 *  Target glyph + explanatory card + toggle row + "CONTINUE" button. */
export function ConsentPhotoAI({
  onAccept,
  onDecline,
}: {
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [enabled, setEnabled] = useState(true);

  const handleContinue = () => {
    if (enabled) onAccept();
    else onDecline();
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.glyphRow}>
        <TargetIcon size={60} color="textSecondary" />
      </View>

      {/* Lead with capability, not caveat (onboarding review 2026-07-23). The
          previous version opened by explaining what the AI does NOT do, which
          sells doubt at the exact moment the app should be showing its one
          genuinely novel thing. The disclaimer is still here — as a footnote,
          which is the weight it should carry. */}
      <ThemedText type="display">{t('consent.ai.title')}</ThemedText>

      <Card style={styles.bulletCard}>
        {[
          t('consent.ai.cap1'),
          t('consent.ai.cap2'),
          t('consent.ai.cap3'),
          t('consent.ai.cap4'),
        ].map((c, i) => (
          <View key={i}>
            {i > 0 && <Divider />}
            <View style={styles.bulletRow}>
              <SignalDotIcon size={8} color="accent" />
              <ThemedText type="small" style={styles.bulletText}>
                {c}
              </ThemedText>
            </View>
          </View>
        ))}
      </Card>

      <ThemedText type="monoSm" style={{ color: theme.textMuted }}>
        {t('consent.ai.footer')}
      </ThemedText>

      <Card style={styles.toggleCard}>
        <View style={styles.toggleRow}>
          <View style={styles.toggleLabels}>
            <ThemedText type="smallBold">{t('consent.ai.toggleLabel')}</ThemedText>
            <ThemedText type="monoSm" themeColor="textMuted">
              {t('consent.ai.toggleSub')}
            </ThemedText>
          </View>
          <Switch
            value={enabled}
            onValueChange={setEnabled}
            trackColor={{ false: theme.surfaceSunken, true: theme.signalGood }}
            thumbColor={theme.onAccent}
            ios_backgroundColor={theme.surfaceSunken}
          />
        </View>
      </Card>

      <PrimaryButton label={t('consent.ai.continueButton')} onPress={handleContinue} />

      <View style={styles.skipRow}>
        <ThemedText
          type="monoSm"
          themeColor="textSecondary"
          style={styles.skipLink}
          onPress={onDecline}>
          {t('consent.ai.decline')}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.three },
  glyphRow: { alignItems: 'center', paddingVertical: Spacing.two },
  bulletCard: { gap: 0 },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  bulletText: { flex: 1 },
  explanatoryCard: {},
  toggleCard: {},
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  toggleLabels: { flex: 1, gap: Spacing.half },
  skipRow: { alignItems: 'center' },
  skipLink: { textDecorationLine: 'underline' },
});
