import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { dayKey, streak } from '@/core/focus/days';
import { timeLeft } from '@/core/focus/pomodoro';
import { useQuery } from '@/data/provider';
import { useFocus } from '@/features/focus/focus-provider';
import { Button, Chip, Stepper } from '@/ui/controls';
import { Page, StatusBarShade, useTabScreenInsets } from '@/ui/layout';
import { AppText } from '@/ui/text';
import { radius, spacing, useTheme } from '@/ui/theme';

export function formatClock(milliseconds: number): string {
  const seconds = Math.ceil(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function FocusScreen() {
  const { t } = useTranslation();
  const insets = useTabScreenInsets();
  const { colors } = useTheme();
  const focus = useFocus();
  const { timer, settings, now } = focus;

  const stats = useQuery('focus:stats', async ({ focus: repository, library }) => {
    const at = Date.now();
    const offset = new Date(at).getTimezoneOffset();
    const [today, days, items] = await Promise.all([repository.day(at, offset), repository.studyDays(offset), library.list()]);
    return { today, streak: streak(days, dayKey(at, offset)), items: items.slice(0, 6) };
  });

  const left = timeLeft(timer, settings, now);
  const phaseLabel =
    timer.phase === 'focus' ? t('focus.phase.focus', { round: timer.round, rounds: settings.rounds }) : t(`focus.phase.${timer.phase}`);
  const accent = timer.phase === 'focus' ? colors.accent : colors.warm;

  return (
    <Page>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <AppText variant="title" accessibilityRole="header">
          {t('focus.title')}
        </AppText>

        <View style={[styles.timer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <AppText variant="label" style={{ color: accent }}>
            {phaseLabel}
          </AppText>
          <Text accessibilityRole="timer" accessibilityLabel={t('focus.left', { time: formatClock(left) })} style={[styles.clock, { color: colors.text }]}>
            {formatClock(left)}
          </Text>
          <View style={styles.dots} accessibilityElementsHidden>
            {Array.from({ length: settings.rounds }, (_, index) => (
              <View
                key={index}
                style={[styles.dot, { backgroundColor: index < timer.round - (timer.phase === 'focus' ? 1 : 0) ? accent : colors.surfaceAlt }]}
              />
            ))}
          </View>
          <View style={styles.row}>
            {timer.status === 'running' ? (
              <Button label={t('focus.pause')} onPress={focus.pause} />
            ) : (
              <Button icon="play" label={timer.status === 'paused' ? t('focus.resume') : timer.phase === 'focus' ? t('focus.startFocus') : t('focus.startBreak')} onPress={focus.start} />
            )}
            <Button kind="secondary" label={t('focus.skip')} onPress={focus.skip} />
            {timer.status !== 'idle' || timer.round > 1 || timer.phase !== 'focus' ? <Button kind="plain" label={t('focus.reset')} onPress={focus.reset} /> : null}
          </View>
          {timer.phase === 'focus' && timer.interruptions > 0 ? (
            <AppText variant="small" color="warm">
              {t('focus.leftApp', { count: timer.interruptions })}
            </AppText>
          ) : null}
        </View>

        {stats.data ? (
          <View style={styles.section}>
            <AppText variant="label" color="textSecondary">
              {t('focus.today')}
            </AppText>
            <AppText>
              {t('focus.sessions', { count: stats.data.today.sessions })} · {t('focus.minutes', { count: stats.data.today.minutes })} ·{' '}
              {t('focus.interruptions', { count: stats.data.today.interruptions })}
            </AppText>
            {stats.data.streak.length > 0 ? (
              <AppText color="accent">{t('focus.streak', { count: stats.data.streak.length })}</AppText>
            ) : (
              <AppText color="textSecondary">{t('focus.noStreak')}</AppText>
            )}
          </View>
        ) : null}

        {stats.data && stats.data.items.length > 0 ? (
          <View style={styles.section}>
            <AppText variant="label" color="textSecondary">
              {t('focus.studying')}
            </AppText>
            <View style={styles.chips}>
              <Chip label={t('focus.nothing')} selected={timer.itemId === null} onPress={() => focus.setItem(null)} />
              {stats.data.items.map((item) => (
                <Chip key={item.id} label={item.title} selected={timer.itemId === item.id} onPress={() => focus.setItem(item.id)} />
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <AppText variant="label" color="textSecondary">
            {t('focus.lengths')}
          </AppText>
          <Stepper label={t('focus.focusMinutes')} value={settings.focus} min={5} max={90} step={5} onChange={(value) => focus.updateSettings({ ...settings, focus: value })} />
          <Stepper label={t('focus.shortMinutes')} value={settings.shortBreak} min={1} max={30} onChange={(value) => focus.updateSettings({ ...settings, shortBreak: value })} />
          <Stepper label={t('focus.longMinutes')} value={settings.longBreak} min={5} max={60} step={5} onChange={(value) => focus.updateSettings({ ...settings, longBreak: value })} />
          <Stepper label={t('focus.rounds')} value={settings.rounds} min={2} max={8} onChange={(value) => focus.updateSettings({ ...settings, rounds: value })} />
          <AppText variant="small" color="textSecondary">
            {t('focus.lengthsHint')}
          </AppText>
        </View>
      </ScrollView>
      <StatusBarShade />
    </Page>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, gap: spacing.xl },
  timer: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center', gap: spacing.md },
  clock: { fontSize: 72, lineHeight: 80, fontWeight: '700', fontVariant: ['tabular-nums'], letterSpacing: -1 },
  dots: { flexDirection: 'row', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm },
  section: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
