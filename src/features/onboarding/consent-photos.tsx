import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { PrimaryButton } from '@/components/form';
import { Card, Divider, EngravedLabel, StatusPill } from '@/components/surface';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Split-panel consent screen (spec 11 pattern):
 * shows "off" (dimmed) vs "on" (active) side by side so consent is informed,
 * not just a wall of text. Accept = informed opt-in; Decline = stays off.
 */
function ConsentPanel({
  side,
  title,
  bullets,
}: {
  side: 'off' | 'on';
  title: string;
  bullets: string[];
}) {
  const theme = useTheme();
  const on = side === 'on';
  return (
    <Card
      style={[
        styles.panel,
        { opacity: on ? 1 : 0.5, borderColor: on ? theme.accent : theme.border },
      ]}>
      <View style={styles.panelHeader}>
        <StatusPill label={side.toUpperCase()} tone={on ? 'good' : 'neutral'} />
        <ThemedText type="label" themeColor={on ? 'text' : 'textMuted'}>
          {title}
        </ThemedText>
      </View>
      <Divider />
      {bullets.map((b) => (
        <View key={b} style={styles.bullet}>
          <ThemedText type="monoSm" themeColor={on ? 'textSecondary' : 'textMuted'}>
            {`${on ? '✓' : '—'}  ${b}`}
          </ThemedText>
        </View>
      ))}
    </Card>
  );
}

/** Consent step: store photos privately (spec 11a). */
export function ConsentPhotoStorage({
  onAccept,
  onDecline,
}: {
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ConsentScreen
      label={t('consent.storage.label')}
      title={t('consent.storage.title')}
      body={t('consent.storage.body')}
      offTitle={t('consent.storage.offTitle')}
      offBullets={[
        t('consent.storage.off1'),
        t('consent.storage.off2'),
        t('consent.storage.off3'),
      ]}
      onTitle={t('consent.storage.onTitle')}
      onBullets={[
        t('consent.storage.on1'),
        t('consent.storage.on2'),
        t('consent.storage.on3'),
      ]}
      acceptLabel={t('consent.storage.accept')}
      declineLabel={t('consent.storage.decline')}
      notice={t('consent.storage.notice')}
      onAccept={onAccept}
      onDecline={onDecline}
    />
  );
}

/** Consent step: AI analysis of photos (spec 11b). */
export function ConsentPhotoAI({
  onAccept,
  onDecline,
}: {
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ConsentScreen
      label={t('consent.ai.label')}
      title={t('consent.ai.title')}
      body={t('consent.ai.body')}
      offTitle={t('consent.ai.offTitle')}
      offBullets={[
        t('consent.ai.off1'),
        t('consent.ai.off2'),
        t('consent.ai.off3'),
      ]}
      onTitle={t('consent.ai.onTitle')}
      onBullets={[
        t('consent.ai.on1'),
        t('consent.ai.on2'),
        t('consent.ai.on3'),
      ]}
      acceptLabel={t('consent.ai.accept')}
      declineLabel={t('consent.ai.decline')}
      notice={t('consent.ai.notice')}
      onAccept={onAccept}
      onDecline={onDecline}
    />
  );
}

// ─── Shared layout ──────────────────────────────────────────────────────────

function ConsentScreen({
  label,
  title,
  body,
  offTitle,
  offBullets,
  onTitle,
  onBullets,
  acceptLabel,
  declineLabel,
  notice,
  onAccept,
  onDecline,
}: {
  label: string;
  title: string;
  body: string;
  offTitle: string;
  offBullets: string[];
  onTitle: string;
  onBullets: string[];
  acceptLabel: string;
  declineLabel: string;
  notice: string;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <EngravedLabel>{label}</EngravedLabel>
      <ThemedText type="display">{title}</ThemedText>
      <ThemedText type="body" themeColor="textSecondary">
        {body}
      </ThemedText>

      <View style={styles.panels}>
        <ConsentPanel side="off" title={offTitle} bullets={offBullets} />
        <ConsentPanel side="on" title={onTitle} bullets={onBullets} />
      </View>

      <ThemedText
        type="monoSm"
        style={[styles.notice, { color: theme.textMuted }]}>
        {notice}
      </ThemedText>

      <PrimaryButton label={acceptLabel} onPress={onAccept} />

      <View style={styles.declineWrap}>
        <ThemedText
          type="monoSm"
          themeColor="textSecondary"
          style={styles.declineLink}
          onPress={onDecline}>
          {declineLabel}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.three },
  panels: { flexDirection: 'row', gap: Spacing.two },
  panel: { flex: 1, gap: Spacing.two, padding: Spacing.three },
  panelHeader: { gap: Spacing.one },
  bullet: { paddingLeft: Spacing.one },
  notice: { lineHeight: 18 },
  declineWrap: { alignItems: 'center' },
  declineLink: { textDecorationLine: 'underline' },
});
