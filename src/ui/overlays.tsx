import { type ReactNode, useEffect, useEffectEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, TextField } from './controls';
import { type IconName, Icon } from './icon';
import { AppText } from './text';
import { type ColorName, MAX_CONTENT_WIDTH, MIN_TOUCH, radius, spacing, useTheme } from './theme';

type OverlayProps = { visible: boolean; onClose: () => void; children: ReactNode; position: 'bottom' | 'center' };

function Overlay({ visible, onClose, children, position }: OverlayProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.backdrop, position === 'center' ? styles.center : styles.bottom]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}
          onPress={onClose}
        />
        {children}
      </KeyboardAvoidingView>
    </Modal>
  );
}

export type SheetAction = {
  key: string;
  label: string;
  hint?: string;
  icon: IconName;
  danger?: boolean;
  onPress: () => void;
};

type SheetProps = { visible: boolean; title: string; actions: SheetAction[]; onClose: () => void };

/** A list of choices that slides over the bottom of the screen. */
export function ActionSheet({ visible, title, actions, onClose }: SheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Overlay visible={visible} onClose={onClose} position="bottom">
      <View
        style={[
          styles.sheet,
          { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, spacing.lg) },
        ]}>
        <AppText variant="small" color="textSecondary" numberOfLines={1} style={styles.sheetTitle}>
          {title}
        </AppText>
        {actions.map((action) => {
          const color: ColorName = action.danger ? 'danger' : 'text';
          return (
            <Pressable
              key={action.key}
              accessibilityRole="button"
              onPress={() => {
                onClose();
                action.onPress();
              }}
              style={({ pressed }) => [styles.sheetRow, pressed && { backgroundColor: colors.surfaceAlt }]}>
              <Icon name={action.icon} color={color} />
              <View style={styles.sheetText}>
                <AppText color={color}>{action.label}</AppText>
                {action.hint ? (
                  <AppText variant="small" color="textSecondary">
                    {action.hint}
                  </AppText>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </Overlay>
  );
}

type DialogProps = {
  visible: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
};

export function ConfirmDialog(props: DialogProps) {
  const { colors } = useTheme();
  return (
    <Overlay visible={props.visible} onClose={props.onClose} position="center">
      <View accessibilityRole="alert" style={[styles.dialog, { backgroundColor: colors.surface }]}>
        <AppText variant="heading">{props.title}</AppText>
        {props.body ? <AppText color="textSecondary">{props.body}</AppText> : null}
        <View style={styles.dialogButtons}>
          <Button kind="secondary" label={props.cancelLabel} onPress={props.onClose} />
          <Button
            kind={props.danger ? 'danger' : 'primary'}
            label={props.confirmLabel}
            onPress={() => {
              props.onClose();
              props.onConfirm();
            }}
          />
        </View>
      </View>
    </Overlay>
  );
}

type PromptProps = {
  visible: boolean;
  title: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel: string;
  cancelLabel: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
};

/** Asks for one line of text. The confirm button stays off until something is typed. */
export function PromptDialog(props: PromptProps) {
  const { colors } = useTheme();
  return (
    <Overlay visible={props.visible} onClose={props.onClose} position="center">
      <View style={[styles.dialog, { backgroundColor: colors.surface }]}>
        <AppText variant="heading">{props.title}</AppText>
        {/* Keyed so the field starts from the current value each time the dialog opens. */}
        {props.visible ? <PromptForm key={props.initialValue ?? ''} {...props} /> : null}
      </View>
    </Overlay>
  );
}

function PromptForm(props: PromptProps) {
  const [value, setValue] = useState(props.initialValue ?? '');
  const trimmed = value.trim();
  const submit = () => {
    if (!trimmed) return;
    props.onClose();
    props.onSubmit(trimmed);
  };
  return (
    <>
      <TextField
        autoFocus
        value={value}
        onChangeText={setValue}
        placeholder={props.placeholder}
        accessibilityLabel={props.title}
        returnKeyType="done"
        maxLength={200}
        onSubmitEditing={submit}
      />
      <View style={styles.dialogButtons}>
        <Button kind="secondary" label={props.cancelLabel} onPress={props.onClose} />
        <Button label={props.confirmLabel} disabled={!trimmed} onPress={submit} />
      </View>
    </>
  );
}

export type SnackbarMessage = { id: number; text: string; actionLabel?: string; onAction?: () => void };

type SnackbarProps = { message: SnackbarMessage | null; onDismiss: () => void; bottomOffset?: number };

/** A short message above the bottom edge that goes away by itself. */
export function Snackbar({ message, onDismiss, bottomOffset = 0 }: SnackbarProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const dismiss = useEffectEvent(onDismiss);
  const id = message?.id;

  useEffect(() => {
    if (id === undefined) return;
    const timer = setTimeout(() => dismiss(), 6000);
    return () => clearTimeout(timer);
  }, [id]);

  if (!message) return null;
  return (
    <View
      pointerEvents="box-none"
      style={[styles.snackbarHost, { bottom: (bottomOffset || insets.bottom) + spacing.sm }]}>
      <View accessibilityLiveRegion="polite" style={[styles.snackbar, { backgroundColor: colors.text }]}>
        <AppText variant="small" numberOfLines={2} style={[styles.snackbarText, { color: colors.background }]}>
          {message.text}
        </AppText>
        {message.actionLabel ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => {
              message.onAction?.();
              onDismiss();
            }}
            style={styles.snackbarAction}>
            <AppText variant="small" style={[styles.snackbarActionText, { color: colors.accentSoft }]}>
              {message.actionLabel}
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center' },
  bottom: { justifyContent: 'flex-end' },
  center: { justifyContent: 'center', padding: spacing.xl },
  sheet: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.lg,
  },
  sheetTitle: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  sheetRow: {
    minHeight: MIN_TOUCH + 8,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  sheetText: { flex: 1, minWidth: 0 },
  dialog: { width: '100%', maxWidth: 420, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.lg },
  dialogButtons: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: spacing.sm },
  snackbarHost: { position: 'absolute', left: spacing.lg, right: spacing.lg, alignItems: 'center' },
  snackbar: {
    width: '100%',
    maxWidth: 480,
    minHeight: MIN_TOUCH + 4,
    borderRadius: radius.md,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  snackbarText: { flex: 1, paddingVertical: spacing.sm },
  snackbarAction: { minHeight: MIN_TOUCH, paddingHorizontal: spacing.md, justifyContent: 'center' },
  snackbarActionText: { fontWeight: '700' },
});
