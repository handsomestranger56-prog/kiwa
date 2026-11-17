import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { timeLeft } from '@/core/focus/pomodoro';
import { Button } from '@/ui/controls';
import { AppText } from '@/ui/text';
import { spacing, useTheme } from '@/ui/theme';

import { useFocus } from './focus-provider';

const KEEP_AWAKE_TAG = 'focus-view';

function clock(milliseconds: number): string {
  const seconds = Math.ceil(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

/** The only control shown in focus view: the time left, a start button, and the way out. Keeps the screen awake. */
export function FocusBar({ onExit }: { onExit: () => void }) {
  // Managed here rather than with the hook, so leaving quickly cannot throw while the lock is still being taken.
  useEffect(() => {
    let released = false;
    const taking = activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      if (released) return;
      released = true;
      void taking.then(() => deactivateKeepAwake(KEEP_AWAKE_TAG)).catch(() => {});
    };
  }, []);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const focus = useFocus();
  const { timer, settings, now } = focus;
  const running = timer.status === 'running';

  return (
    <View style={[styles.bar, { paddingTop: insets.top + spacing.sm, backgroundColor: colors.background, borderBottomColor: colors.border }]}>
      <Button kind="plain" label={t('focus.exitView')} onPress={onExit} />
      <View style={styles.right}>
        <AppText variant="bodyStrong" style={styles.time} accessibilityLabel={t('focus.left', { time: clock(timeLeft(timer, settings, now)) })}>
          {clock(timeLeft(timer, settings, now))}
        </AppText>
        {running ? null : <Button kind="secondary" icon="play" label={timer.phase === 'focus' ? t('focus.startFocus') : t('focus.startBreak')} onPress={focus.start} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingRight: spacing.sm },
  time: { fontVariant: ['tabular-nums'] },
});
