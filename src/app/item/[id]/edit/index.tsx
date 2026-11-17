import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { freshId, moveLesson, putLesson, removeLesson, setFinalExam, updateMeta } from '@/core/edit/document';
import { DECK_ASSESSMENT_ID } from '@/core/quiz/session';
import { type Level, type LibraryDocument, type ParseIssue, COURSE_FORMAT, QUIZ_FORMAT, levelSchema } from '@/core/schema';
import { Field, SaveBar, StructureRow, useEditor } from '@/features/editor/parts';
import { QuestionList } from '@/features/editor/question-list';
import { useApply } from '@/features/editor/use-apply';
import { Button, Chip, TextField } from '@/ui/controls';
import { EmptyState, Page } from '@/ui/layout';
import { PromptDialog, Snackbar } from '@/ui/overlays';
import { AppText } from '@/ui/text';
import { spacing } from '@/ui/theme';

export default function EditItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const editor = useEditor(id);

  return (
    <Page>
      <Stack.Screen options={{ title: t('editor.edit') }} />
      {editor.loading ? null : editor.document ? (
        <ItemEditor document={editor.document} save={editor.save} />
      ) : (
        <EmptyState icon="close" title={t('item.notFound')} body="" />
      )}
    </Page>
  );
}

type Props = { document: LibraryDocument; save: (next: LibraryDocument) => Promise<ParseIssue[]> };

function ItemEditor({ document, save }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const { apply, snackbar, dismiss } = useApply(document, save);

  const [title, setTitle] = useState(document.title);
  const [description, setDescription] = useState(document.description ?? '');
  const [level, setLevel] = useState<Level | undefined>(document.level);
  const [language, setLanguage] = useState(document.language);
  const [tags, setTags] = useState(document.tags.join(', '));
  const [issues, setIssues] = useState<ParseIssue[]>([]);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [naming, setNaming] = useState(false);

  const touch = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setSaved(false);
  };

  const saveDetails = () => {
    setFailed(false);
    const next = updateMeta(document, {
      title,
      description: description.trim() || undefined,
      level,
      language: language.trim(),
      tags: tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    });
    save(next)
      .then((problems) => {
        setIssues(problems);
        setSaved(problems.length === 0);
      })
      .catch(() => setFailed(true));
  };

  const openLesson = (lessonId: string) =>
    router.push({ pathname: '/item/[id]/edit/lesson/[lessonId]', params: { id: document.id, lessonId } });
  const openAssessment = (assessmentId: string) =>
    router.push({ pathname: '/item/[id]/edit/assessment/[assessmentId]', params: { id: document.id, assessmentId } });

  const addLesson = (lessonTitle: string) => {
    if (document.format !== COURSE_FORMAT) return;
    const lessonId = freshId(document, 'lesson');
    void apply(putLesson(document, { id: lessonId, title: lessonTitle, blocks: [], assessments: [] })).then((ok) => {
      if (ok) openLesson(lessonId);
    });
  };

  const addFinalExam = () => {
    if (document.format !== COURSE_FORMAT) return;
    const examId = freshId(document, 'exam');
    void apply(setFinalExam(document, { id: examId, mode: 'exam', passMark: 0.7, questions: [] })).then((ok) => {
      if (ok) openAssessment(examId);
    });
  };

  return (
    <>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Field label={t('editor.title')}>
          <TextField value={title} onChangeText={touch(setTitle)} accessibilityLabel={t('editor.title')} maxLength={200} />
        </Field>
        <Field label={t('editor.description')}>
          <TextField value={description} onChangeText={touch(setDescription)} accessibilityLabel={t('editor.description')} multiline style={styles.medium} />
        </Field>
        <Field label={t('create.level')}>
          <View style={styles.chips}>
            <Chip label={t('editor.noLevel')} selected={level === undefined} onPress={() => touch(setLevel)(undefined)} />
            {levelSchema.options.map((option) => (
              <Chip key={option} label={t(`level.${option}`)} selected={level === option} onPress={() => touch(setLevel)(option)} />
            ))}
          </View>
        </Field>
        <Field label={t('create.language')} hint={t('create.languageHint')}>
          <TextField value={language} onChangeText={touch(setLanguage)} accessibilityLabel={t('create.language')} autoCapitalize="none" autoCorrect={false} maxLength={12} />
        </Field>
        <Field label={t('editor.tags')} hint={t('editor.tagsHint')}>
          <TextField value={tags} onChangeText={touch(setTags)} accessibilityLabel={t('editor.tags')} autoCapitalize="none" />
        </Field>

        {document.format === COURSE_FORMAT ? (
          <>
            <Field label={t('item.lessons')}>
              {document.lessons.length === 0 ? <AppText color="textSecondary">{t('item.emptyCourse')}</AppText> : null}
              {document.lessons.map((lesson, index) => (
                <StructureRow
                  key={lesson.id}
                  title={`${index + 1}. ${lesson.title}`}
                  subtitle={lesson.summary}
                  onOpen={() => openLesson(lesson.id)}
                  onUp={index > 0 ? () => void apply(moveLesson(document, lesson.id, -1)) : undefined}
                  onDown={index < document.lessons.length - 1 ? () => void apply(moveLesson(document, lesson.id, 1)) : undefined}
                  onRemove={() => void apply(removeLesson(document, lesson.id), t('editor.lessonRemoved', { title: lesson.title }))}
                />
              ))}
              <View style={styles.start}>
                <Button kind="secondary" icon="add" label={t('editor.addLesson')} onPress={() => setNaming(true)} />
              </View>
            </Field>
            <Field label={t('item.finalExam')}>
              {document.finalExam ? (
                <StructureRow
                  title={document.finalExam.title ?? t('item.finalExam')}
                  subtitle={t('units.quiz', { count: document.finalExam.questions.length })}
                  onOpen={() => openAssessment(document.finalExam?.id ?? '')}
                  onRemove={() => void apply(setFinalExam(document, null), t('editor.examRemoved'))}
                />
              ) : (
                <View style={styles.start}>
                  <Button kind="secondary" icon="add" label={t('editor.addFinalExam')} onPress={addFinalExam} />
                </View>
              )}
            </Field>
          </>
        ) : document.format === QUIZ_FORMAT ? (
          <Field label={t('editor.questions')}>
            <StructureRow
              title={t(`mode.${document.assessment.mode}`)}
              subtitle={t('units.quiz', { count: document.assessment.questions.length })}
              onOpen={() => openAssessment(document.assessment.id)}
            />
          </Field>
        ) : (
          <Field label={t('item.cards')}>
            <QuestionList
              document={document}
              assessmentId={DECK_ASSESSMENT_ID}
              questions={document.cards}
              onChange={(next, undoLabel) => void apply(next, undoLabel)}
            />
          </Field>
        )}
      </ScrollView>

      <SaveBar onSave={saveDetails} saved={saved} issues={issues} failed={failed} label={t('editor.saveDetails')} />
      <PromptDialog
        visible={naming}
        title={t('editor.newLessonTitle')}
        placeholder={t('create.namePlaceholder')}
        confirmLabel={t('common.create')}
        cancelLabel={t('common.cancel')}
        onSubmit={addLesson}
        onClose={() => setNaming(false)}
      />
      <Snackbar message={snackbar} onDismiss={dismiss} bottomOffset={96} />
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.xl },
  medium: { minHeight: 72, paddingTop: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  start: { alignItems: 'flex-start' },
});
