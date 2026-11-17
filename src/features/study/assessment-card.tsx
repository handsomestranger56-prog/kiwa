import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { DECK_ASSESSMENT_ID } from '@/core/quiz/session';
import type { Assessment } from '@/core/schema';
import type { AssessmentRecord } from '@/data/attempts-repository';
import { Button, Tag } from '@/ui/controls';
import { AppText } from '@/ui/text';
import { MIN_TOUCH, radius, spacing, useTheme } from '@/ui/theme';

type Props = {
  itemId: string;
  assessment: Assessment;
  record: AssessmentRecord | undefined;
  /** Shown above the details. Defaults to the assessment's own title or its mode. */
  title?: string;
};

/** One quiz, test, exam or deck round: what it is, how the last try went, and a button to begin. */
export function AssessmentCard({ itemId, assessment, record, title }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();

  const isDeck = assessment.id === DECK_ASSESSMENT_ID;
  const count = assessment.questions.length;
  const heading = title ?? assessment.title;
  const details = [
    // Without a title of its own the mode is the heading, so it is not repeated here.
    isDeck || !heading ? null : t(`mode.${assessment.mode}`),
    t(isDeck ? 'units.deck' : 'units.quiz', { count }),
    assessment.mode === 'practice' ? null : t('item.passMark', { percent: Math.round(assessment.passMark * 100) }),
    assessment.timeLimitMinutes ? t('item.minutes', { count: assessment.timeLimitMinutes }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const last = record?.last;
  const action = record?.openAttemptId ? t('study.resume') : last ? t('study.tryAgain') : isDeck ? t('study.studyCards') : t('study.start');

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={styles.text}>
        <AppText variant="bodyStrong">{heading ?? t(`mode.${assessment.mode}`)}</AppText>
        <AppText variant="small" color="textSecondary">
          {details}
        </AppText>
      </View>

      {last ? (
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('study.seeLastResult')}
          onPress={() =>
            router.push({ pathname: '/item/[id]/result/[attemptId]', params: { id: itemId, attemptId: last.attemptId } })
          }
          style={({ pressed }) => [styles.last, pressed && styles.pressed]}>
          {isDeck ? null : (
            <AppText variant="small" color="textSecondary">
              {t('study.lastScore', { percent: last.percent })}
            </AppText>
          )}
          {last.passed === null ? null : (
            <Tag tone={last.passed ? 'accent' : 'warm'} label={last.passed ? t('study.passed') : t('study.notPassed')} />
          )}
          <AppText variant="small" color="accent" style={styles.link}>
            {t('study.seeLastResult')}
          </AppText>
        </Pressable>
      ) : null}

      <View style={styles.button}>
        <Button
          icon="play"
          label={action}
          disabled={count === 0}
          onPress={() =>
            router.push({ pathname: '/item/[id]/play/[assessmentId]', params: { id: itemId, assessmentId: assessment.id } })
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  text: { gap: 2 },
  last: { minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  link: { fontWeight: '600' },
  button: { alignItems: 'flex-start' },
  pressed: { opacity: 0.6 },
});
