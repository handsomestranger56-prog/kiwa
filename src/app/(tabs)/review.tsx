import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { dayKey, previousDay, streak } from '@/core/focus/days';
import { localTime } from '@/core/focus/planner';
import { useQuery } from '@/data/provider';
import { Button } from '@/ui/controls';
import { Page, StatusBarShade, useTabScreenInsets } from '@/ui/layout';
import { AppText } from '@/ui/text';
import { radius, spacing, useTheme } from '@/ui/theme';

const DAY = 24 * 60 * 60_000;

export default function ReviewScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const insets = useTabScreenInsets();
  const { colors } = useTheme();

  const stats = useQuery('review:stats', async ({ reviews, focus, attempts }) => {
    const now = Date.now();
    const offset = new Date(now).getTimezoneOffset();
    const endOfTomorrow = localTime(now, offset, 2, 0, 0);
    const [counts, days, sessions, finished] = await Promise.all([
      reviews.counts(now, endOfTomorrow),
      focus.studyDays(offset),
      focus.all(),
      attempts.finishedSince(now - 30 * DAY),
    ]);

    // The last seven local days, oldest first, with focus minutes on each.
    const today = dayKey(now, offset);
    const week: { key: string; studied: boolean; minutes: number }[] = [];
    let cursor = today;
    for (let index = 0; index < 7; index += 1) {
      const key = cursor;
      const minutes = sessions.filter((session) => dayKey(session.endedAt, offset) === key).reduce((total, session) => total + session.minutes, 0);
      week.unshift({ key, studied: days.has(key), minutes });
      cursor = previousDay(cursor);
    }

    const earned = finished.reduce((total, attempt) => total + attempt.earned, 0);
    const possible = finished.reduce((total, attempt) => total + attempt.total, 0);
    return {
      counts,
      streak: streak(days, today),
      week,
      quizzes: finished.length,
      average: possible > 0 ? Math.round((earned / possible) * 100) : null,
    };
  });

  const data = stats.data;
  const maxMinutes = Math.max(25, ...(data?.week.map((day) => day.minutes) ?? [0]));
  // Short names ("пн", "Mon"), not single letters: one letter stands for two days in every app language.
  const weekday = (key: string) =>
    new Date(`${key}T12:00:00Z`).toLocaleDateString(i18n.language, { weekday: 'short', timeZone: 'UTC' }).replace(/\.$/, '');

  return (
    <Page>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <AppText variant="title" accessibilityRole="header">
          {t('review.title')}
        </AppText>

        {data ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <AppText style={styles.big}>{data.counts.due}</AppText>
            <AppText variant="heading">{t('review.due', { count: data.counts.due })}</AppText>
            <AppText color="textSecondary">
              {data.counts.total === 0
                ? t('review.emptyHint')
                : `${t('review.tomorrow', { count: data.counts.dueTomorrow })} · ${t('review.total', { count: data.counts.total })}`}
            </AppText>
            <View style={styles.start}>
              <Button icon="play" label={t('review.start')} disabled={data.counts.due === 0} onPress={() => router.push('/review-session')} />
            </View>
          </View>
        ) : null}

        {data ? (
          <View style={styles.section}>
            <AppText variant="label" color="textSecondary">
              {t('review.progress')}
            </AppText>
            <AppText color={data.streak.length > 0 ? 'accent' : 'textSecondary'}>
              {data.streak.length > 0 ? t('focus.streak', { count: data.streak.length }) : t('focus.noStreak')}
            </AppText>

            <View
              style={styles.week}
              accessible
              accessibilityLabel={t('review.weekSummary', { count: data.week.filter((day) => day.studied).length })}>
              {data.week.map((day) => (
                <View key={day.key} style={styles.dayColumn}>
                  <View style={[styles.barTrack, { backgroundColor: colors.surfaceAlt }]}>
                    <View
                      style={[
                        styles.bar,
                        { height: `${Math.max(day.studied ? 8 : 0, (day.minutes / maxMinutes) * 100)}%`, backgroundColor: day.studied ? colors.accent : colors.surfaceAlt },
                      ]}
                    />
                  </View>
                  <AppText variant="small" color="textSecondary" numberOfLines={1}>
                    {weekday(day.key)}
                  </AppText>
                </View>
              ))}
            </View>
            <AppText variant="small" color="textSecondary">
              {t('review.weekHint')}
            </AppText>

            <AppText>
              {data.average === null ? t('review.noQuizzes') : t('review.quizzes', { count: data.quizzes, percent: data.average })}
            </AppText>
          </View>
        ) : null}
      </ScrollView>
      <StatusBarShade />
    </Page>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, gap: spacing.xl },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.sm },
  big: { fontSize: 48, lineHeight: 54, fontWeight: '700', fontVariant: ['tabular-nums'] },
  start: { alignItems: 'flex-start', marginTop: spacing.sm },
  section: { gap: spacing.md },
  week: { flexDirection: 'row', gap: spacing.sm, height: 120 },
  dayColumn: { flex: 1, alignItems: 'center', gap: spacing.xs },
  barTrack: { flex: 1, width: '100%', borderRadius: radius.sm, justifyContent: 'flex-end', overflow: 'hidden' },
  bar: { width: '100%', borderRadius: radius.sm },
});
