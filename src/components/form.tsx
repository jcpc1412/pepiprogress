import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ChamferBox } from '@/components/chamfer';
import { CheckIcon } from '@/components/icons';
import { ThemedText } from '@/components/themed-text';
import { Chamfer, Fonts, Radii, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
// Subtle press feedback — the instrument "settling" when touched (~0.97, Motion token).
import { pressScale as pressed } from '@/lib/motion';

/** A toggleable option — monochrome: selected = filled accent, idle = sunken. */
export function OptionChip({
  label,
  selected,
  onPress,
  disabled,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed: p }) => [disabled && styles.disabled, pressed(p)]}>
      <ChamferBox
        chamfer={Chamfer.chip}
        fill={selected ? theme.accent : theme.surfaceSunken}
        borderColor={selected ? undefined : theme.border}>
        <View style={styles.chip}>
          <ThemedText type="mono" themeColor={selected ? 'onAccent' : 'text'}>
            {label}
          </ThemedText>
        </View>
      </ChamferBox>
    </Pressable>
  );
}

/** Single-select chip group (route, frequency, unit, compound, …). */
export function SingleSelectChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | undefined;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.chipWrap}>
      {options.map((o) => (
        <OptionChip
          key={o.value}
          label={o.label}
          selected={value === o.value}
          onPress={() => onChange(o.value)}
        />
      ))}
    </View>
  );
}

/** Connected segmented control — one shared sunken track, active segment filled
 *  accent. Single source for QUICK/DETAILED and LIGHT/DARK/AUTO (redesign R2). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | undefined;
  onChange: (v: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.segTrack, { backgroundColor: theme.surfaceSunken, borderColor: theme.border }]}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.segItem, { backgroundColor: active ? theme.accent : 'transparent' }]}>
            <ThemedText type="label" themeColor={active ? 'onAccent' : 'textSecondary'}>
              {o.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A 1–5 rating selector — chamfered segments that fill up to the value.
 *  Each segment is a ≥44px tap target (this is the most-touched input). */
export function ScaleSelector({
  value,
  onChange,
  min = 1,
  max = 5,
  disabled,
}: {
  value: number | undefined;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const steps = [];
  for (let i = min; i <= max; i += 1) steps.push(i);
  return (
    <View style={[styles.scaleRow, disabled && styles.disabled]}>
      {steps.map((step) => {
        const filled = value != null && step <= value;
        return (
          <Pressable
            key={step}
            accessibilityRole="button"
            accessibilityState={{ selected: value === step, disabled: !!disabled }}
            disabled={disabled}
            hitSlop={6}
            onPress={() => onChange(step)}
            style={({ pressed: p }) => [
              styles.scaleSeg,
              {
                backgroundColor: filled ? theme.accent : theme.surfaceSunken,
                borderColor: theme.border,
              },
              pressed(p),
            ]}>
            <ThemedText type="monoSm" themeColor={filled ? 'onAccent' : 'textMuted'}>
              {String(step)}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Text input with label, focus ring, and error state.
 *
 *  Pass `revealToggle` on a `secureTextEntry` field to get an eye button that
 *  flips the masking. Typing a password blind is the main cause of failed
 *  sign-ins, so the toggle is offered rather than assumed: it only renders when
 *  asked for, and it never leaves the value revealed across mounts. */
export function LabeledInput({
  label,
  error,
  style,
  onFocus,
  onBlur,
  revealToggle,
  secureTextEntry,
  ...rest
}: TextInputProps & { label?: string; error?: string; revealToggle?: boolean }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const borderColor = error ? theme.signalBad : focused ? theme.accent : theme.border;
  const showToggle = revealToggle && secureTextEntry;
  return (
    <View style={styles.field}>
      {label ? <ThemedText type="label">{label}</ThemedText> : null}
      <View>
        <TextInput
          placeholderTextColor={theme.textMuted}
          secureTextEntry={secureTextEntry && !revealed}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            styles.input,
            {
              color: theme.text,
              backgroundColor: theme.surfaceSunken,
              borderColor,
              // thicken to 1px on focus/error so the state reads against the hairline default
              borderWidth: focused || error ? 1 : StyleSheet.hairlineWidth,
            },
            showToggle && styles.inputWithToggle,
            style,
          ]}
          {...rest}
        />
        {showToggle ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? t('auth.hidePassword') : t('auth.showPassword')}
            hitSlop={8}
            onPress={() => setRevealed((v) => !v)}
            style={({ pressed: p }) => [styles.revealButton, pressed(p)]}>
            <SymbolView
              name={
                revealed
                  ? { ios: 'eye.slash', android: 'visibility_off', web: 'visibility_off' }
                  : { ios: 'eye', android: 'visibility', web: 'visibility' }
              }
              size={18}
              tintColor={theme.textMuted}
            />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <ThemedText type="monoSm" themeColor="signalBad">
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

/**
 * Action-affordance vocabulary (design system):
 *  - primary   = filled accent      (the one main action on a surface)
 *  - secondary = sunken + bordered  (supporting actions: Back, Cancel, alt paths)
 *  - tertiary  = underlined text link (TextButton, for inline/low-emphasis actions)
 */
export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  confirm,
  variant = 'primary',
}: {
  label: string;
  /** May return a Promise — the button auto-shows a spinner while it resolves
   *  and a success checkmark on completion (redesign R3 button feedback). */
  onPress: () => void | Promise<unknown>;
  disabled?: boolean;
  loading?: boolean;
  /** For synchronous actions, flash a success checkmark after a press. */
  confirm?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const theme = useTheme();
  const isSecondary = variant === 'secondary';
  // 'idle' | 'busy' (async pending) | 'done' (brief success check)
  const [phase, setPhase] = useState<'idle' | 'busy' | 'done'>('idle');
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flashDone = () => {
    setPhase('done');
    if (doneTimer.current) clearTimeout(doneTimer.current);
    doneTimer.current = setTimeout(() => setPhase('idle'), 1200);
  };

  const handlePress = () => {
    const result = onPress();
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      setPhase('busy');
      (result as Promise<unknown>).then(
        () => flashDone(),
        () => setPhase('idle'),
      );
    } else if (confirm) {
      flashDone();
    }
  };

  const busy = loading || phase === 'busy';
  const isDisabled = disabled || busy;
  const fg: ThemeColor = isSecondary ? 'text' : 'onAccent';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!busy }}
      disabled={isDisabled}
      onPress={handlePress}
      style={({ pressed: p }) => [isDisabled && styles.disabled, pressed(p)]}>
      <ChamferBox
        chamfer={Chamfer.button}
        fill={isSecondary ? theme.surfaceSunken : theme.accent}
        borderColor={isSecondary ? theme.border : undefined}>
        <View style={styles.button}>
          {busy ? (
            <ActivityIndicator color={isSecondary ? theme.text : theme.onAccent} />
          ) : phase === 'done' ? (
            <CheckIcon size={20} color={fg} />
          ) : (
            <ThemedText type="label" themeColor={fg} style={styles.buttonLabel}>
              {label}
            </ThemedText>
          )}
        </View>
      </ChamferBox>
    </Pressable>
  );
}

/** Convenience alias for the secondary variant. */
export function SecondaryButton(props: Omit<Parameters<typeof PrimaryButton>[0], 'variant'>) {
  return <PrimaryButton {...props} variant="secondary" />;
}

/** Tertiary action: an underlined text link with press feedback + accessibility.
 *  tone: secondary (default), accent (emphasis), or bad (destructive). */
export function TextButton({
  label,
  onPress,
  disabled,
  tone = 'secondary',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'secondary' | 'accent' | 'bad';
}) {
  const color: ThemeColor = tone === 'accent' ? 'accent' : tone === 'bad' ? 'signalBad' : 'textSecondary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed: p }) => ({ opacity: disabled ? 0.4 : p ? 0.6 : 1 })}>
      <ThemedText type="smallBold" themeColor={color} style={styles.textButton}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segTrack: {
    flexDirection: 'row',
    borderRadius: Radii.chamfer,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.half,
    gap: Spacing.half,
  },
  segItem: {
    flex: 1,
    minHeight: 40,
    borderRadius: Radii.chamfer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scaleRow: { flexDirection: 'row', gap: Spacing.two },
  scaleSeg: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radii.chamfer,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: { gap: Spacing.one },
  // Leaves room for the reveal button so long passwords never run under it.
  inputWithToggle: { paddingRight: Spacing.five },
  revealButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: Spacing.five,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Radii.chamfer,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontFamily: Fonts.sans,
    fontSize: 15,
    minHeight: 44,
  },
  button: {
    minHeight: 50,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
  buttonLabel: { letterSpacing: 1.6 },
  textButton: { textDecorationLine: 'underline' },
});
