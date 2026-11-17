import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { updateAssessment } from '@/core/edit/document';
import { findAssessment } from '@/core/quiz/session';
import { type Assessment, type AssessmentMode, type LibraryDocument, type ParseIssue, assessmentModeSchema } from '@/core/schema';
import { Field, SaveBar, useEditor } from '@/features/editor/parts';
import { QuestionList } from '@/features/editor/question-list';
import { useApply } from '@/features/editor/use-apply';
import { Chip, Stepper, TextField } from '@/ui/controls';
import { EmptyState, Page } from '@/ui/layout';
import { Snackbar } from '@/ui/overlays';
import { spacing } from '@/ui/theme';

export default function EditAssessmentScreen() {
  const { id, assessmentId } = useLocalSearchParams<{ id: string; assessmentId: string }>();
  const { t } = useTranslation();
  const editor = useEditor(id);
  const located = editor.document ? findAssessment(editor.document, assessmentId) : null;

  return (
    <Page>
      <Stack.Screen options={{ title: t('editor.assessment.screen') }} />
      {editor.loading ? null : editor.document && located ? (
        <AssessmentEditor document={editor.document} assessment={located.assessment} save={editor.save} />
      ) : (
        <EmptyState icon="close" title={t('study.missing')} body="" />
      )}
    </Page>
  );
}

type Props = { document: LibraryDocument; assessment: Assessment; save: (next: LibraryDocument) => Promise<ParseIssue[]> };

const digits = (text: string) => text.replace(/[^0-9]/g, '');

function AssessmentEditor({ document, assessment, save }: Props) {
  const { t } = useTranslation();
  const { apply, snackbar, dismiss } = useApply(document, save);

  const [title, setTitle] = useState(assessment.title ?? '');
  const [mode, setMode] = useState<AssessmentMode>(assessment.mode);
  const [passPercent, setPassPercent] = useState(Math.round(assessment.passMark * 100));
  const [timeLimit, setTimeLimit] = useState(assessment.timeLimitMinutes ? String(assessment.timeLimitMinutes) : '');
  const [sampleSize, setSampleSize] = useState(assessment.sampleSize ? String(assessment.sampleSize) : '');
  const [issues, setIssues] = useState<ParseIssue[]>([]);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);

  const change = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setSaved(false);
  };

  const saveSettings = () => {
    setFailed(false);
    const next = updateAssessment(document, assessment.id, {
      title: title.trim() || undefined,
      mode,
      passMark: passPercent / 100,
      timeLimitMinutes: mode !== 'practice' && timeLimit ? Number(timeLimit) : undefined,
      sampleSize: sampleSize ? Number(sampleSize) : undefined,
    });
    save(next)
      .then((problems) => {
        setIssues(problems);
        setSaved(problems.length === 0);
      })
      .catch(() => setFailed(true));
  };

  return (
    <>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Field label={t('editor.questions')}>
          <QuestionList
            document={document}
            assessmentId={assessment.id}
            questions={assessment.questions}
            onChange={(next, undoLabel) => void apply(next, undoLabel)}
          />
        </Field>

        <Field label={t('editor.assessment.title')}>
          <TextField value={title} onChangeText={change(setTitle)} accessibilityLabel={t('editor.assessment.title')} maxLength={200} />
        </Field>
        <Field label={t('create.quizMode')} hint={t(`editor.assessment.modeHint.${mode}`)}>
          <View style={styles.chips}>
            {assessmentModeSchema.options.map((option) => (
              <Chip key={option} label={t(`mode.${option}`)} selected={mode === option} onPress={() => change(setMode)(option)} />
            ))}
          </View>
        </Field>
        {mode === 'practice' ? null : (
          <>
            <Stepper
              label={t('editor.assessment.passMark')}
              value={passPercent}
              min={0}
              max={100}
              step={5}
              onChange={change(setPassPercent)}
            />
            <Field label={t('editor.assessment.timeLimit')}>
              <TextField value={timeLimit} onChangeText={(value) => change(setTimeLimit)(digits(value))} accessibilityLabel={t('editor.assessment.timeLimit')} keyboardType="number-pad" maxLength={3} />
            </Field>
          </>
        )}
        <Field label={t('editor.assessment.sampleSize')} hint={t('editor.assessment.sampleHint')}>
          <TextField value={sampleSize} onChangeText={(value) => change(setSampleSize)(digits(value))} accessibilityLabel={t('editor.assessment.sampleSize')} keyboardType="number-pad" maxLength={3} />
        </Field>
      </ScrollView>

      <SaveBar onSave={saveSettings} saved={saved} issues={issues} failed={failed} label={t('editor.assessment.save')} />
      <Snackbar message={snackbar} onDismiss={dismiss} bottomOffset={96} />
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.xl },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
