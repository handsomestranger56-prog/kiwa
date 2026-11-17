import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useEffectEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isAnswered, isSelfGraded } from '@/core/quiz/answers';
import { canCheck } from '@/core/quiz/ai-feedback';
import { ESSAY_RATINGS, type EssayRating } from '@/core/quiz/answers';
import { grade } from '@/core/quiz/grading';
import { DECK_ASSESSMENT_ID, isRevealed, unansweredCount } from '@/core/quiz/session';
import type { Question } from '@/core/schema';
import { AiActions } from '@/features/ai/ai-actions';
import { Feedback } from '@/features/study/feedback';
import { QuestionView } from '@/features/study/question-views';
import { usePlayer } from '@/features/study/use-player';
import { Button } from '@/ui/controls';
import { Icon } from '@/ui/icon';
import { EmptyState, Loading, Page } from '@/ui/layout';
import { Markdown } from '@/ui/markdown';
import { ConfirmDialog } from '@/ui/overlays';
import { AppText } from '@/ui/text';
import { MIN_TOUCH, radius, spacing, useTheme } from '@/ui/theme';

export default function PlayScreen() {
  const { id, assessmentId } = useLocalSearchParams<{ id: string; assessmentId: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const player = usePlayer(id, assessmentId);
  const [confirming, setConfirming] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [failed, setFailed] = useState(false);

  const ready = player.status === 'ready' ? player : null;
  const limitMinutes = ready?.located.assessment.timeLimitMinutes;
  const deadline = ready && limitMinutes ? ready.attempt.startedAt + limitMinutes * 60_000 : null;

  const finish = () => {
    if (!ready || finishing) return;
    setFinishing(true);
    setFailed(false);
    ready
      .finish()
      .then((attemptId) => router.replace({ pathname: '/item/[id]/result/[attemptId]', params: { id, attemptId } }))
      .catch(() => {
        setFinishing(false);
        setFailed(true);
      });
  };

  const remaining = useCountdown(deadline, finish);

  if (player.status === 'loading') return <Loading />;
  if (player.status !== 'ready') {
    return (
      <Page>
        <Stack.Screen options={{ title: '' }} />
        <EmptyState
          icon="quiz"
          title={player.status === 'empty' ? t('study.empty') : t('study.missing')}
          body=""
          action={<Button kind="secondary" label={t('common.close')} onPress={() => router.back()} />}
        />
      </Page>
    );
  }

  const { questions, session, located } = player;
  const practice = located.assessment.mode === 'practice';
  const isDeck = assessmentId === DECK_ASSESSMENT_ID;
  const index = Math.min(session.index, questions.length - 1);
  const question = questions[index];
  const answer = session.answers[question.id];
  const answered = isAnswered(question, answer);
  const revealed = isRevealed(question, session, practice);
  const checked = session.checked.includes(question.id);
  const isLast = index === questions.length - 1;
  const needsCheck = practice && !isSelfGraded(question) && !checked;

  const submit = () => {
    if (!practice && unansweredCount(questions, session) > 0) setConfirming(true);
    else finish();
  };

  const title = isDeck ? player.document.title : (located.assessment.title ?? t(`mode.${located.assessment.mode}`));

  return (
    <Page>
      <Stack.Screen
        options={{
          title,
          headerRight:
            remaining === null
              ? undefined
              : () => (
                  <View style={styles.timer} accessibilityLabel={t('study.timeLeft', { time: formatClock(remaining) })}>
                    <Icon name="timer" size={18} color={remaining < 60_000 ? 'danger' : 'textSecondary'} />
                    <AppText variant="bodyStrong" color={remaining < 60_000 ? 'danger' : 'text'} style={styles.clock}>
                      {formatClock(remaining)}
                    </AppText>
                  </View>
                ),
        }}
      />

      <View style={styles.progress}>
        <AppText variant="small" color="textSecondary">
          {t(isDeck ? 'study.cardOf' : 'study.questionOf', { current: index + 1, total: questions.length })}
        </AppText>
        <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
          <View style={[styles.fill, { backgroundColor: colors.accent, width: `${((index + 1) / questions.length) * 100}%` }]} />
        </View>
      </View>

      {/* Keyed by question so each one starts scrolled to the top with its hint closed. */}
      <QuestionPage key={question.id} question={question} showHint={practice}>
        <QuestionView
          question={question}
          answer={answer}
          onChange={(next) => player.answer(question.id, next)}
          locked={checked}
          revealed={revealed}
        />
        {revealed ? <Feedback question={question} grade={grade(question, answer, session.ai?.[question.id])} /> : null}
        {revealed || (practice && answer?.type === 'essay' && answer.submitted) ? (
          <AiActions
            question={question}
            answer={answer}
            correct={grade(question, answer, session.ai?.[question.id]).outcome === 'correct'}
            allowCheck={canCheck(question) && (question.type === 'essay' || grade(question, answer).outcome !== 'correct')}
            check={session.ai?.[question.id]}
            explanation={session.explanations?.[question.id]}
            onCheck={(check) =>
              player.saveAi(question.id, {
                check,
                // An essay checked by AI counts as rated, so practice can move on.
                answer: answer?.type === 'essay' ? { ...answer, submitted: true, rating: nearestRating(check.score) } : undefined,
              })
            }
            onExplain={(explanation) => player.saveAi(question.id, { explanation })}
          />
        ) : null}
        {player.saveFailed ? <AppText color="danger">{t('study.saveFailed')}</AppText> : null}
        {failed ? <AppText color="danger">{t('errors.generic')}</AppText> : null}
      </QuestionPage>

      <View
        style={[
          styles.bar,
          { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, spacing.md) },
        ]}>
        {index > 0 ? <Button kind="secondary" label={t('study.back')} onPress={() => player.move(index - 1)} /> : <View />}
        {needsCheck ? (
          <Button label={t('study.check')} disabled={!answered} onPress={() => player.check(question.id)} />
        ) : isLast ? (
          <Button
            label={practice ? t('study.finish') : t('study.submit')}
            disabled={finishing || (practice && !answered)}
            onPress={submit}
          />
        ) : (
          <Button label={t('study.next')} disabled={practice && !answered} onPress={() => player.move(index + 1)} />
        )}
      </View>

      <ConfirmDialog
        visible={confirming}
        title={t('study.submitUnanswered.title', { count: unansweredCount(questions, session) })}
        body={t('study.submitUnanswered.body')}
        confirmLabel={t('study.submitUnanswered.confirm')}
        cancelLabel={t('common.cancel')}
        onConfirm={finish}
        onClose={() => setConfirming(false)}
      />
    </Page>
  );
}

type QuestionPageProps = { question: Question; showHint: boolean; children: React.ReactNode };

function QuestionPage({ question, showHint, children }: QuestionPageProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [hintOpen, setHintOpen] = useState(false);

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <View style={question.type === 'flashcard' ? [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }] : null}>
        <Markdown source={question.prompt} />
      </View>

      {showHint && question.hint ? (
        hintOpen ? (
          <View style={[styles.hint, { backgroundColor: colors.warmSoft }]}>
            <AppText variant="label" color="warm">
              {t('study.hint')}
            </AppText>
            <Markdown source={question.hint} />
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => setHintOpen(true)}
            style={({ pressed }) => [styles.hintLink, pressed && styles.pressed]}>
            <Icon name="hint" size={18} color="warm" />
            <AppText variant="small" color="warm" style={styles.strong}>
              {t('study.showHint')}
            </AppText>
          </Pressable>
        )
      ) : null}

      {children}
    </ScrollView>
  );
}

/** Milliseconds left until `deadline`, updated every second. Calls `onExpire` once when it reaches zero. */
function useCountdown(deadline: number | null, onExpire: () => void): number | null {
  const [now, setNow] = useState(() => Date.now());
  const expire = useEffectEvent(onExpire);

  useEffect(() => {
    if (deadline === null) return;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current >= deadline) {
        clearInterval(timer);
        expire();
      }
    };
    const timer = setInterval(tick, 1000);
    tick();
    return () => clearInterval(timer);
  }, [deadline]);

  return deadline === null ? null : Math.max(0, deadline - now);
}

function nearestRating(score: number): EssayRating {
  return ESSAY_RATINGS.reduce((best, rating) => (Math.abs(rating - score) < Math.abs(best - score) ? rating : best));
}

function formatClock(milliseconds: number): string {
  const seconds = Math.ceil(milliseconds / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  progress: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, gap: spacing.xs },
  track: { height: 6, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: 6, borderRadius: radius.pill },
  content: { padding: spacing.lg, gap: spacing.lg },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.xl, minHeight: 140, justifyContent: 'center' },
  hint: { borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  hintLink: { minHeight: MIN_TOUCH, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'flex-start' },
  strong: { fontWeight: '600' },
  pressed: { opacity: 0.6 },
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  timer: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm },
  clock: { fontVariant: ['tabular-nums'] },
});
