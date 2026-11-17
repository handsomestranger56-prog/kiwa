import { Stack, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type Answer, isAnswered, isSelfGraded } from '@/core/quiz/answers';
import { grade } from '@/core/quiz/grading';
import { findQuestion } from '@/core/quiz/session';
import { type ReviewCard, qualityFromOutcome, qualityFromRating, review } from '@/core/review/scheduler';
import type { Question } from '@/core/schema';
import { useData } from '@/data/provider';
import { Feedback } from '@/features/study/feedback';
import { QuestionView } from '@/features/study/question-views';
import { Button } from '@/ui/controls';
import { EmptyState, Loading, Page } from '@/ui/layout';
import { Markdown } from '@/ui/markdown';
import { AppText } from '@/ui/text';
import { radius, spacing, useTheme } from '@/ui/theme';

type Entry = { card: ReviewCard; question: Question; itemTitle: string };

/** Due questions from every course, quiz and deck, one at a time. Each answer reschedules its card. */
export default function ReviewSessionScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const data = useData();

  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<Answer | undefined>(undefined);
  const [checked, setChecked] = useState(false);
  const [right, setRight] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const cards = await data.reviews.due(Date.now(), 30);
      const documents = new Map<string, Awaited<ReturnType<typeof data.library.getDocument>>>();
      const found: Entry[] = [];
      for (const card of cards) {
        if (!documents.has(card.itemId)) documents.set(card.itemId, await data.library.getDocument(card.itemId).catch(() => null));
        const document = documents.get(card.itemId);
        const question = document ? findQuestion(document, card.questionId) : null;
        // The question was edited away. Its card has nothing left to review.
        if (!document || !question) {
          await data.reviews.remove(card.itemId, card.questionId);
          continue;
        }
        found.push({ card, question, itemTitle: document.title });
      }
      if (active) setEntries(found);
    })().catch(() => {
      if (active) setEntries([]);
    });
    return () => {
      active = false;
    };
  }, [data]);

  if (entries === null) return <Loading />;

  if (index >= entries.length) {
    return (
      <Page>
        <Stack.Screen options={{ title: t('review.title') }} />
        <EmptyState
          icon="checkCircle"
          title={entries.length === 0 ? t('review.nothing') : t('review.done')}
          body={entries.length === 0 ? '' : t('review.doneBody', { right, total: entries.length })}
          action={<Button label={t('result.done')} onPress={() => router.back()} />}
        />
      </Page>
    );
  }

  const { card, question, itemTitle } = entries[index];
  const selfGraded = isSelfGraded(question);
  const answered = isAnswered(question, answer);
  const revealed = selfGraded ? answered : checked;
  const result = grade(question, answer);

  const next = () => {
    setFailed(false);
    const quality = answer?.type === 'flashcard' && answer.rating ? qualityFromRating(answer.rating) : qualityFromOutcome(result.outcome);
    data.reviews
      .save([review(card, quality, Date.now())])
      .then(() => {
        if (result.outcome === 'correct') setRight(right + 1);
        setAnswer(undefined);
        setChecked(false);
        setIndex(index + 1);
      })
      .catch(() => setFailed(true));
  };

  return (
    <Page>
      <Stack.Screen options={{ title: t('review.counter', { current: index + 1, total: entries.length }) }} />
      <ScrollView key={`${card.itemId}:${card.questionId}`} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <AppText variant="small" color="textSecondary">
          {itemTitle}
        </AppText>
        <View style={question.type === 'flashcard' ? [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }] : null}>
          <Markdown source={question.prompt} />
        </View>
        <QuestionView question={question} answer={answer} onChange={setAnswer} locked={checked} revealed={revealed} />
        {revealed ? <Feedback question={question} grade={result} /> : null}
        {failed ? <AppText color="danger">{t('errors.generic')}</AppText> : null}
      </ScrollView>
      <View style={[styles.bar, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        {!selfGraded && !checked ? (
          <Button label={t('study.check')} disabled={!answered} onPress={() => setChecked(true)} />
        ) : (
          <Button label={index === entries.length - 1 ? t('study.finish') : t('study.next')} disabled={!answered} onPress={next} />
        )}
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.xl, minHeight: 120, justifyContent: 'center' },
  bar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
});
