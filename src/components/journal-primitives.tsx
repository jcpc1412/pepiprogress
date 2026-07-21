import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ChamferBox } from '@/components/chamfer';
import { ThemedText } from '@/components/themed-text';
import { Chamfer, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { LogSource } from '@/lib/journal-day';

export type { LogSource };

/**
 * Journal primitives (Wave 7 item 35, F4). Four reusable presentational pieces
 * the Journal (item 41b) is built from and the Today strip (item 38) reuses, so
 * the day-in-review is normalized by construction. All are dumb: callers pass
 * already-resolved data (formatted strings, logged flags, a source enum); these
 * own only the instrument styling + accessibility.
 *
 * Anti-chore framing (spec 03, no shame): completeness is dots + "N of M areas",
 * never a percentage or a streak; a no-log day is an empty ring, never a scold.
 */

/** One descriptor per day in the WeekStrip; the caller formats + resolves each. */
export type WeekDay = {
  iso: string;
  weekday: string; // pre-formatted short weekday, e.g. "MON"
  dayNum: string; // pre-formatted day-of-month, e.g. "21"
  logged: boolean;
  isFuture?: boolean;
};

/** Tiny uppercase provenance chip: HEALTH / PEPI / QUICK / TYPICAL / TAP. */
export function SourceBadge({ source }: { source: LogSource }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const label = t(`journal.source.${source}` as 'journal.source.health');
  return (
    <View accessibilityRole="text" accessibilityLabel={t('journal.loggedVia', { source: label })}>
      <ChamferBox chamfer={Chamfer.pill} fill={theme.surfaceSunken} borderColor={theme.border}>
        <View style={styles.badge}>
          <ThemedText type="label" themeColor="textMuted">
            {label}
          </ThemedText>
        </View>
      </ChamferBox>
    </View>
  );
}

/**
 * Completeness dot-meter: `filled` of `total` dots filled, with an "N of M areas"
 * caption. No percentages, no streaks — presence, not performance.
 */
export function CompletenessDots({
  filled,
  total,
  caption = true,
}: {
  filled: number;
  total: number;
  caption?: boolean;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  const n = Math.max(0, Math.floor(total));
  const f = Math.max(0, Math.min(n, Math.floor(filled)));
  const areas = t('journal.areas', { filled: f, total: n });
  return (
    <View style={styles.dots} accessibilityRole="text" accessibilityLabel={areas}>
      {Array.from({ length: n }, (_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i < f
              ? { backgroundColor: theme.numeral, borderColor: 'transparent' }
              : { backgroundColor: theme.surfaceSunken, borderColor: theme.border },
          ]}
        />
      ))}
      {caption && n > 0 ? (
        <ThemedText type="monoSm" themeColor="textMuted" style={styles.cap}>
          {areas}
        </ThemedText>
      ) : null}
    </View>
  );
}

/**
 * Seven-day history nav. Green dot = logged day, empty ring = no log (owner
 * decision 2026-07-21). Selected day fills with accent; future days dim + inert.
 * Green here is data-presence status, the one sanctioned signal use (DESIGN §2).
 */
export function WeekStrip({
  days,
  selected,
  onSelect,
}: {
  days: WeekDay[];
  selected: string;
  onSelect: (iso: string) => void;
}) {
  const { t } = useTranslation();
  const theme = useTheme();
  return (
    <View style={styles.week}>
      {days.map((d) => {
        const isSel = d.iso === selected;
        const a11y = `${d.weekday} ${d.dayNum}, ${d.logged ? t('journal.logged') : t('journal.noLog')}`;
        return (
          <Pressable
            key={d.iso}
            disabled={d.isFuture}
            accessibilityRole="button"
            accessibilityState={{ selected: isSel, disabled: !!d.isFuture }}
            accessibilityLabel={a11y}
            onPress={() => onSelect(d.iso)}
            style={({ pressed }) => [styles.dayPress, pressed && !d.isFuture && styles.pressed]}>
            <ChamferBox
              chamfer={Chamfer.chip}
              fill={isSel ? theme.accent : theme.surfaceSunken}
              borderColor={isSel ? theme.accent : theme.border}
              style={styles.dayFill}>
              <View style={[styles.day, d.isFuture && styles.future]}>
                <ThemedText type="label" themeColor={isSel ? 'onAccent' : 'textMuted'}>
                  {d.weekday}
                </ThemedText>
                <ThemedText type="mono" themeColor={isSel ? 'onAccent' : 'textSecondary'} style={styles.dayNum}>
                  {d.dayNum}
                </ThemedText>
                <View
                  style={[
                    styles.dayDot,
                    d.logged
                      ? { backgroundColor: theme.signalGood, borderColor: 'transparent' }
                      : { backgroundColor: 'transparent', borderColor: isSel ? theme.onAccent : theme.border },
                  ]}
                />
              </View>
            </ChamferBox>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * One "label · value · source" row for the day-in-review. When `empty` + `onAdd`
 * are supplied, the value slot becomes a quiet underlined add link instead — the
 * only nudge the Journal ever makes.
 */
export function ValueRow({
  label,
  value,
  source,
  empty,
  onAdd,
  addLabel,
}: {
  label: string;
  value: string;
  source?: LogSource;
  empty?: boolean;
  onAdd?: () => void;
  addLabel?: string;
}) {
  return (
    <View style={styles.row}>
      <ThemedText type="body" themeColor="textSecondary" style={styles.rowKey}>
        {label}
      </ThemedText>
      <View style={styles.rowVal}>
        {empty && onAdd && addLabel ? (
          <Pressable onPress={onAdd} accessibilityRole="button" accessibilityLabel={addLabel}>
            <ThemedText type="monoSm" themeColor="textMuted" style={styles.add}>
              {addLabel}
            </ThemedText>
          </Pressable>
        ) : (
          <>
            <ThemedText type="mono" themeColor={empty ? 'textMuted' : 'text'}>
              {value}
            </ThemedText>
            {source ? <SourceBadge source={source} /> : null}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // SourceBadge
  badge: { paddingHorizontal: Spacing.one + 1, paddingVertical: 2 },

  // CompletenessDots
  dots: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one + 1 },
  dot: { width: 5, height: 5, borderRadius: 2.5, borderWidth: StyleSheet.hairlineWidth },
  cap: { marginLeft: Spacing.one, letterSpacing: 0.5 },

  // WeekStrip
  week: { flexDirection: 'row', gap: Spacing.one + 1 },
  dayPress: { flex: 1 },
  dayFill: { flex: 1 },
  pressed: { opacity: 0.6 },
  day: { alignItems: 'center', paddingVertical: Spacing.two - 1 },
  future: { opacity: 0.3 },
  dayNum: { marginTop: 3 },
  dayDot: { width: 6, height: 6, borderRadius: 3, marginTop: 5, borderWidth: StyleSheet.hairlineWidth },

  // ValueRow
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.two, gap: Spacing.two },
  rowKey: { flexShrink: 1 },
  rowVal: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  add: { textDecorationLine: 'underline', letterSpacing: 0.6 },
});
