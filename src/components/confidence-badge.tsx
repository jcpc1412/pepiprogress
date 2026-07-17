import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ChamferBox } from '@/components/chamfer';
import { ThemedText } from '@/components/themed-text';
import { Chamfer, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { meterFilled, type ConfidenceLevel } from '@/lib/confidence';

/**
 * The one confidence badge (W4-18). A monochrome instrument gauge — a filled
 * three-dot meter plus the level word — used everywhere Pepi concludes so the
 * register never varies by surface. Deliberately NOT the good/watch/bad signal
 * palette: confidence is orthogonal to favourability, so it reads in neutral
 * ink. When a rationale is supplied the badge is a button that toggles a short
 * "why this level" line beneath it (rationale on tap).
 */
export function ConfidenceBadge({
  level,
  rationale,
}: {
  level: ConfidenceLevel;
  rationale?: string;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const filled = meterFilled(level);
  const label = t(`confidence.${level}` as 'confidence.low');
  const a11yLabel = t('confidence.label', { level: label });

  const badge = (
    <ChamferBox chamfer={Chamfer.pill} fill={theme.surfaceSunken}>
      <View style={styles.badge}>
        <View style={styles.meter}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: i < filled ? theme.numeral : theme.border },
              ]}
            />
          ))}
        </View>
        <ThemedText type="monoSm" themeColor="textSecondary">
          {label}
        </ThemedText>
      </View>
    </ChamferBox>
  );

  if (!rationale) {
    return (
      <View accessibilityRole="text" accessibilityLabel={a11yLabel}>
        {badge}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityHint={t('confidence.why')}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={({ pressed }) => pressed && styles.pressed}>
        {badge}
      </Pressable>
      {open ? (
        <ThemedText type="monoSm" themeColor="textMuted" style={styles.rationale}>
          {rationale}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one, alignItems: 'flex-start' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, paddingHorizontal: 2 },
  meter: { flexDirection: 'row', gap: 2 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  pressed: { opacity: 0.6 },
  rationale: { fontStyle: 'italic' },
});
