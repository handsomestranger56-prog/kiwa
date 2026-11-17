import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type TextInputProps, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { type IconName, Icon } from './icon';
import { AppText } from './text';
import { type ColorName, MIN_TOUCH, radius, spacing, useTheme } from './theme';

type ButtonProps = {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'danger' | 'plain';
  icon?: IconName;
  disabled?: boolean;
};

export function Button({ label, onPress, kind = 'primary', icon, disabled }: ButtonProps) {
  const { colors } = useTheme();
  const look = {
    primary: { background: colors.accent, text: 'onAccent', border: colors.accent },
    secondary: { background: colors.surface, text: 'text', border: colors.border },
    danger: { background: colors.danger, text: 'onDanger', border: colors.danger },
    plain: { background: 'transparent', text: 'accent', border: 'transparent' },
  }[kind] as { background: string; text: ColorName; border: string };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: look.background, borderColor: look.border },
        (pressed || disabled) && styles.dimmed,
      ]}>
      {icon ? <Icon name={icon} size={18} color={look.text} /> : null}
      <AppText variant="bodyStrong" color={look.text}>
        {label}
      </AppText>
    </Pressable>
  );
}

type IconButtonProps = {
  icon: IconName;
  label: string;
  onPress: () => void;
  color?: ColorName;
  selected?: boolean;
};

/** A square button that shows only an icon. `label` is read by screen readers. */
export function IconButton({ icon, label, onPress, color = 'textSecondary', selected }: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      aria-selected={selected}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && styles.dimmed]}>
      <Icon name={icon} color={color} />
    </Pressable>
  );
}

type ChipProps = { label: string; selected: boolean; onPress: () => void };

export function Chip({ label, selected, onPress }: ChipProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      aria-selected={selected}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? colors.accent : colors.surface,
          borderColor: selected ? colors.accent : colors.border,
        },
        pressed && styles.dimmed,
      ]}>
      <AppText variant="small" color={selected ? 'onAccent' : 'text'} style={styles.chipText}>
        {label}
      </AppText>
    </Pressable>
  );
}

type TagProps = { label: string; tone?: 'neutral' | 'accent' | 'warm' };

/** A small non-interactive label. */
export function Tag({ label, tone = 'neutral' }: TagProps) {
  const { colors } = useTheme();
  const look = {
    neutral: { background: colors.surfaceAlt, text: 'textSecondary' },
    accent: { background: colors.accentSoft, text: 'accent' },
    warm: { background: colors.warmSoft, text: 'warm' },
  }[tone] as { background: string; text: ColorName };
  return (
    <View style={[styles.tag, { backgroundColor: look.background }]}>
      <AppText variant="label" color={look.text}>
        {label}
      </AppText>
    </View>
  );
}

type StepperProps = { label: string; value: number; min: number; max: number; step?: number; onChange: (value: number) => void };

/** A number with minus and plus buttons, for small counts. */
export function Stepper({ label, value, min, max, step = 1, onChange }: StepperProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();
  return (
    <View style={styles.stepper}>
      <AppText style={styles.stepperLabel}>{label}</AppText>
      <View style={[styles.stepperBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <IconButton
          icon="minus"
          label={t('common.fewer', { label })}
          color={value <= min ? 'border' : 'text'}
          onPress={() => onChange(Math.max(min, value - step))}
        />
        <AppText variant="bodyStrong" style={styles.stepperValue} accessibilityLabel={`${label}: ${value}`}>
          {value}
        </AppText>
        <IconButton
          icon="add"
          label={t('common.more', { label })}
          color={value >= max ? 'border' : 'text'}
          onPress={() => onChange(Math.min(max, value + step))}
        />
      </View>
    </View>
  );
}

type FieldProps = TextInputProps & { leading?: ReactNode; trailing?: ReactNode };

export function TextField({ leading, trailing, style, onFocus, onBlur, ...rest }: FieldProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        styles.field,
        { backgroundColor: colors.surface, borderColor: focused ? colors.accent : colors.border },
      ]}>
      {leading}
      <TextInput
        placeholderTextColor={colors.textSecondary}
        selectionColor={colors.accent}
        style={[styles.input, webInput, { color: colors.text }, style]}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        {...rest}
      />
      {trailing}
    </View>
  );
}

// The field's border already shows focus, so the browser's own outline would be a second ring.
const webInput = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null;

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  iconButton: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  dimmed: { opacity: 0.55 },
  chip: {
    minHeight: 36,
    paddingHorizontal: spacing.md + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
  },
  chipText: { fontWeight: '500' },
  tag: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm, alignSelf: 'flex-start' },
  field: {
    minHeight: MIN_TOUCH + 4,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  input: { flex: 1, fontSize: 16, paddingVertical: spacing.sm, minWidth: 0 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  stepperLabel: { flex: 1, minWidth: 0 },
  stepperBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.md },
  stepperValue: { minWidth: 36, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
