import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';

import { freshId, putQuestion } from '@/core/edit/document';
import { type QuestionDraft, blankDraft, draftFromQuestion, questionFromDraft } from '@/core/edit/drafts';
import { DECK_ASSESSMENT_ID, findAssessment } from '@/core/quiz/session';
import { type LibraryDocument, type ParseIssue, type Question, QUESTION_TYPES } from '@/core/schema';
import { SaveBar, useEditor } from '@/features/editor/parts';
import { QuestionForm } from '@/features/editor/question-form';
import { useUnsavedGuard } from '@/features/editor/unsaved-guard';
import { Tag } from '@/ui/controls';
import { EmptyState, Loading, Page } from '@/ui/layout';
import { spacing } from '@/ui/theme';

export default function EditQuestionScreen() {
  const params = useLocalSearchParams<{ id: string; questionId: string; assessment: string; type?: string }>();
  const { t } = useTranslation();
  const editor = useEditor(params.id);

  const located = editor.document ? findAssessment(editor.document, params.assessment) : null;
  const existing = located?.assessment.questions.find((question) => question.id === params.questionId) ?? null;
  const newType = QUESTION_TYPES.find((type) => type === params.type);
  const isNew = params.questionId === 'new';

  return (
    <Page>
      <Stack.Screen options={{ title: isNew ? t('editor.question.screenNew') : t('editor.question.screenEdit') }} />
      {editor.loading ? <Loading /> : editor.document && located && (existing || (isNew && newType)) ? (
        <QuestionEditor
          document={editor.document}
          assessmentId={params.assessment}
          existing={existing}
          initial={existing ? draftFromQuestion(existing) : blankDraft(newType ?? 'single_choice')}
          save={editor.save}
        />
      ) : (
        <EmptyState icon="close" title={t('study.missing')} body="" />
      )}
    </Page>
  );
}

type Props = {
  document: LibraryDocument;
  assessmentId: string;
  existing: Question | null;
  initial: QuestionDraft;
  save: (next: LibraryDocument) => Promise<ParseIssue[]>;
};

function QuestionEditor({ document, assessmentId, existing, initial, save }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const [draft, setDraft] = useState(initial);
  const [start] = useState(() => JSON.stringify(initial));
  const guard = useUnsavedGuard(JSON.stringify(draft) !== start);
  const [issues, setIssues] = useState<ParseIssue[]>([]);
  const [failed, setFailed] = useState(false);

  const saveQuestion = () => {
    setFailed(false);
    const id = existing?.id ?? freshId(document, assessmentId === DECK_ASSESSMENT_ID ? 'card' : 'q');
    const result = questionFromDraft(draft, id);
    if (!result.ok) {
      setIssues(result.issues);
      return;
    }
    save(putQuestion(document, assessmentId, result.question))
      .then((problems) => {
        setIssues(problems);
        if (problems.length === 0) guard.leave(() => router.back());
      })
      .catch(() => setFailed(true));
  };

  return (
    <>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Tag tone="accent" label={t(`questionType.${draft.type}`)} />
        <QuestionForm
          draft={draft}
          onChange={(next) => {
            setDraft(next);
            setIssues([]);
          }}
        />
      </ScrollView>
      <SaveBar onSave={saveQuestion} issues={issues} failed={failed} />
      {guard.dialog}
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.xl },
});
