import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { moveQuestion, removeQuestion } from '@/core/edit/document';
import { DECK_ASSESSMENT_ID } from '@/core/quiz/session';
import { type LibraryDocument, type Question, type QuestionType, QUESTION_TYPES } from '@/core/schema';
import { Button } from '@/ui/controls';
import { ActionSheet } from '@/ui/overlays';
import { AppText } from '@/ui/text';
import { spacing } from '@/ui/theme';

import { StructureRow } from './parts';

const ICON_BY_TYPE = { flashcard: 'deck' } as const;

type Props = {
  document: LibraryDocument;
  assessmentId: string;
  questions: readonly Question[];
  /** Saves a changed document. `undoLabel` is set when the change removed something. */
  onChange: (next: LibraryDocument, undoLabel?: string) => void;
};

/** The questions of one assessment, or the cards of a deck, with add, open, reorder and remove. */
export function QuestionList({ document, assessmentId, questions, onChange }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const [choosing, setChoosing] = useState(false);
  const isDeck = assessmentId === DECK_ASSESSMENT_ID;

  const open = (questionId: string, type?: QuestionType) =>
    router.push({
      pathname: '/item/[id]/edit/question/[questionId]',
      params: { id: document.id, questionId, assessment: assessmentId, ...(type ? { type } : {}) },
    });

  return (
    <View style={styles.list}>
      {questions.length === 0 ? <AppText color="textSecondary">{isDeck ? t('editor.noCards') : t('editor.noQuestions')}</AppText> : null}
      {questions.map((question, index) => (
        <StructureRow
          key={question.id}
          title={`${index + 1}. ${question.prompt}`}
          subtitle={isDeck ? undefined : t(`questionType.${question.type}`)}
          onOpen={() => open(question.id)}
          onUp={index > 0 ? () => onChange(moveQuestion(document, assessmentId, question.id, -1)) : undefined}
          onDown={index < questions.length - 1 ? () => onChange(moveQuestion(document, assessmentId, question.id, 1)) : undefined}
          onRemove={() => onChange(removeQuestion(document, assessmentId, question.id), isDeck ? t('editor.cardRemoved') : t('editor.questionRemoved'))}
        />
      ))}
      <View style={styles.start}>
        <Button
          kind="secondary"
          icon="add"
          label={isDeck ? t('editor.addCard') : t('editor.addQuestion')}
          onPress={() => (isDeck ? open('new', 'flashcard') : setChoosing(true))}
        />
      </View>
      <ActionSheet
        visible={choosing}
        title={t('editor.chooseType')}
        onClose={() => setChoosing(false)}
        actions={QUESTION_TYPES.map((type) => ({
          key: type,
          icon: type in ICON_BY_TYPE ? 'deck' : 'quiz',
          label: t(`questionType.${type}`),
          onPress: () => open('new', type),
        }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  start: { alignItems: 'flex-start' },
});
