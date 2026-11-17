import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { isSelfGraded } from '@/core/quiz/answers';
import type { Grade } from '@/core/quiz/grading';
import type { Question } from '@/core/schema';
import { Icon } from '@/ui/icon';
import { Markdown } from '@/ui/markdown';
import { AppText } from '@/ui/text';
import { type ColorName, radius, spacing, useTheme } from '@/ui/theme';

type Props = {
  question: Question;
  grade: Grade;
  /** Leave out the Correct / Not quite line where the screen already shows it. */
  explanationOnly?: boolean;
};

/** Shown once an answer may be revealed: whether it was right, and why. */
export function Feedback({ question, grade, explanationOnly = false }: Props) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  // Essays and flashcards are rated by the learner, so a verdict from the app would only repeat it.
  const verdict = !explanationOnly && !isSelfGraded(question);
  if (!verdict && !question.explanation) return null;

  const look = {
    correct: { background: colors.successSoft, text: 'success', icon: 'check' },
    partial: { background: colors.warmSoft, text: 'warm', icon: 'check' },
    incorrect: { background: colors.dangerSoft, text: 'danger', icon: 'close' },
  }[grade.outcome] as { background: string; text: ColorName; icon: 'check' | 'close' };

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.box, { backgroundColor: verdict ? look.background : colors.surfaceAlt }]}>
      {verdict ? (
        <View style={styles.verdict}>
          <Icon name={look.icon} size={20} color={look.text} />
          <AppText variant="bodyStrong" color={look.text}>
            {t(`study.outcome.${grade.outcome}`)}
          </AppText>
        </View>
      ) : null}
      {question.explanation ? <Markdown source={question.explanation} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  verdict: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
