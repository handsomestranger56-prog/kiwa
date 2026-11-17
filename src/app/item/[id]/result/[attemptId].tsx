import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FLASHCARD_RATINGS } from '@/core/quiz/answers';
import { type AiCheck, type AiExplanation, canCheck } from '@/core/quiz/ai-feedback';
import { type Outcome, grade, hasPassed, summarize } from '@/core/quiz/grading';
import { DECK_ASSESSMENT_ID, findAssessment, sessionQuestions } from '@/core/quiz/session';
import { useData, useQuery } from '@/data/provider';
import { AiActions } from '@/features/ai/ai-actions';
import { applyAttemptCompletion } from '@/features/study/completion';
import { Feedback } from '@/features/study/feedback';
import { QuestionView } from '@/features/study/question-views';
import { Button, Tag } from '@/ui/controls';
import { EmptyState, Page } from '@/ui/layout';
import { Markdown } from '@/ui/markdown';
import { AppText } from '@/ui/text';
import { radius, spacing, useTheme } from '@/ui/theme';

const OUTCOME_TONE: Record<Outcome, 'accent' | 'warm' | 'neutral'> = {
  correct: 'accent',
  partial: 'warm',
  incorrect: 'neutral',
};

export default function ResultScreen() {
  const { id, attemptId } = useLocalSearchParams<{ id: string; attemptId: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const data = useData();

  const loaded = useQuery(`result:${id}:${attemptId}`, async ({ library, attempts }) => {
    const [attempt, document] = await Promise.all([attempts.get(attemptId), library.getDocument(id)]);
    const located = attempt && document ? findAssessment(document, attempt.assessmentId) : null;
    return attempt && located && document ? { attempt, located, document } : null;
  });

  if (loaded.loading) return <Page />;
  if (!loaded.data) {
    return (
      <Page>
        <Stack.Screen options={{ title: t('result.title') }} />
        <EmptyState icon="close" title={t('study.missing')} body="" />
      </Page>
    );
  }

  const { attempt, located, document } = loaded.data;
  const questions = sessionQuestions(located.assessment, attempt.state);
  const summary = summarize(questions, attempt.state.answers, attempt.state.ai ?? {});

  /** Stores AI feedback on the finished attempt and recalculates its score, which a check can change. */
  const saveAi = (questionId: string, changes: { check?: AiCheck; explanation?: AiExplanation }) => {
    const state = {
      ...attempt.state,
      ai: changes.check ? { ...attempt.state.ai, [questionId]: changes.check } : attempt.state.ai,
      explanations: changes.explanation ? { ...attempt.state.explanations, [questionId]: changes.explanation } : attempt.state.explanations,
    };
    const next = summarize(questions, state.answers, state.ai ?? {});
    const passed = hasPassed(located.assessment.mode, located.assessment.passMark, next);
    data.attempts
      .amend(attempt.id, state, { earned: next.earned, total: next.total, passed })
      .then(() => applyAttemptCompletion(data, document, located, passed))
      .catch(() => {});
  };
  const isDeck = attempt.assessmentId === DECK_ASSESSMENT_ID;
  const seconds = attempt.finishedAt ? Math.max(1, Math.round((attempt.finishedAt - attempt.startedAt) / 1000)) : null;
  const duration =
    seconds === null
      ? null
      : seconds < 60
        ? t('result.seconds', { count: seconds })
        : t('result.minutes', { count: Math.round(seconds / 60) });

  return (
    <Page>
      <Stack.Screen options={{ title: t('result.title') }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.score, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {isDeck ? (
            <>
              <AppText variant="heading">{t('result.roundComplete')}</AppText>
              <View style={styles.ratings}>
                {FLASHCARD_RATINGS.map((rating) => {
                  const count = questions.filter((question) => {
                    const answer = attempt.state.answers[question.id];
                    return answer?.type === 'flashcard' && answer.rating === rating;
                  }).length;
                  return (
                    <View key={rating} style={styles.rating}>
                      <AppText variant="title">{count}</AppText>
                      <AppText variant="small" color="textSecondary">
                        {t(`study.flashcard.rating.${rating}`)}
                      </AppText>
                    </View>
                  );
                })}
              </View>
            </>
          ) : (
            <>
              <AppText style={styles.percent} accessibilityLabel={t('result.percent', { percent: summary.percent })}>
                {summary.percent}%
              </AppText>
              {attempt.passed === null ? (
                <AppText variant="heading">{t('result.practiceComplete')}</AppText>
              ) : (
                <View>
                  <Tag tone={attempt.passed ? 'accent' : 'warm'} label={attempt.passed ? t('study.passed') : t('study.notPassed')} />
                </View>
              )}
              <AppText color="textSecondary">
                {t('result.points', { earned: formatPoints(summary.earned), total: formatPoints(summary.total) })}
                {attempt.passed === null ? '' : ` · ${t('item.passMark', { percent: Math.round(located.assessment.passMark * 100) })}`}
              </AppText>
            </>
          )}
          {duration ? (
            <AppText variant="small" color="textSecondary">
              {t('result.duration', { duration })}
            </AppText>
          ) : null}
        </View>

        <AppText variant="label" color="textSecondary">
          {t('result.review')}
        </AppText>
        {questions.map((question, index) => {
          const result = summary.results[index];
          return (
            <View key={question.id} style={[styles.question, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.questionHead}>
                <AppText variant="label" color="textSecondary">
                  {t(isDeck ? 'study.cardOf' : 'study.questionOf', { current: index + 1, total: questions.length })}
                </AppText>
                {isDeck ? null : <Tag tone={OUTCOME_TONE[result.grade.outcome]} label={t(`study.outcome.${result.grade.outcome}`)} />}
              </View>
              <Markdown source={question.prompt} />
              <QuestionView question={question} answer={attempt.state.answers[question.id]} onChange={noop} locked revealed />
              {question.explanation ? <Feedback question={question} grade={result.grade} explanationOnly /> : null}
              {isDeck ? null : (
                <AiActions
                  question={question}
                  answer={attempt.state.answers[question.id]}
                  correct={result.grade.outcome === 'correct'}
                  allowCheck={canCheck(question) && (question.type === 'essay' || grade(question, attempt.state.answers[question.id]).outcome !== 'correct')}
                  check={attempt.state.ai?.[question.id]}
                  explanation={attempt.state.explanations?.[question.id]}
                  onCheck={(check) => saveAi(question.id, { check })}
                  onExplain={(explanation) => saveAi(question.id, { explanation })}
                />
              )}
            </View>
          );
        })}
      </ScrollView>

      <View
        style={[
          styles.bar,
          { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, spacing.md) },
        ]}>
        <Button
          kind="secondary"
          label={t('study.tryAgain')}
          onPress={() =>
            router.replace({ pathname: '/item/[id]/play/[assessmentId]', params: { id, assessmentId: attempt.assessmentId } })
          }
        />
        <Button label={t('result.done')} onPress={() => router.back()} />
      </View>
    </Page>
  );
}

function noop() {}

/** Points without trailing zeros: 3, 2.5. */
function formatPoints(points: number): string {
  return String(Math.round(points * 10) / 10);
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.md },
  score: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.xl, alignItems: 'center', gap: spacing.sm },
  percent: { fontSize: 56, lineHeight: 64, fontWeight: '700', letterSpacing: -1 },
  ratings: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.xl },
  rating: { alignItems: 'center', minWidth: 56 },
  question: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  questionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
