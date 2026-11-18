import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { freshId, putLesson, putLessonAssessment, removeAssessment } from '@/core/edit/document';
import { type AssessmentMode, type Block, type BlockType, type Course, type Lesson, type ParseIssue, COURSE_FORMAT } from '@/core/schema';
import { Field, SaveBar, StructureRow, useEditor } from '@/features/editor/parts';
import { useApply } from '@/features/editor/use-apply';
import { Button, Chip, IconButton, TextField } from '@/ui/controls';
import { EmptyState, Loading, Page } from '@/ui/layout';
import { ActionSheet, Snackbar } from '@/ui/overlays';
import { AppText } from '@/ui/text';
import { monoFont, radius, spacing, useTheme } from '@/ui/theme';

/** A block while it is being typed. Every field is text and may still be empty. */
type BlockDraft = { type: BlockType; markdown: string; language: string; code: string; url: string; alt: string; caption: string; tone: 'note' | 'tip' | 'warning' };

const BLOCK_TYPES: BlockType[] = ['text', 'code', 'callout', 'image'];
const emptyBlock = (type: BlockType): BlockDraft => ({ type, markdown: '', language: '', code: '', url: '', alt: '', caption: '', tone: 'note' });

function toDraft(block: Block): BlockDraft {
  const draft = emptyBlock(block.type);
  if (block.type === 'text') return { ...draft, markdown: block.markdown };
  if (block.type === 'code') return { ...draft, code: block.code, language: block.language ?? '' };
  if (block.type === 'callout') return { ...draft, markdown: block.markdown, tone: block.tone };
  return { ...draft, url: block.url, alt: block.alt ?? '', caption: block.caption ?? '' };
}

/** Blocks the user added but left empty are dropped instead of blocking the save. */
function fromDrafts(drafts: BlockDraft[]): Block[] {
  const blocks: Block[] = [];
  for (const draft of drafts) {
    if (draft.type === 'text' && draft.markdown.trim()) blocks.push({ type: 'text', markdown: draft.markdown });
    if (draft.type === 'callout' && draft.markdown.trim()) blocks.push({ type: 'callout', tone: draft.tone, markdown: draft.markdown });
    if (draft.type === 'code' && draft.code.trim()) {
      blocks.push({ type: 'code', code: draft.code, ...(draft.language.trim() ? { language: draft.language.trim() } : {}) });
    }
    if (draft.type === 'image' && draft.url.trim()) {
      blocks.push({
        type: 'image',
        url: draft.url.trim(),
        ...(draft.alt.trim() ? { alt: draft.alt.trim() } : {}),
        ...(draft.caption.trim() ? { caption: draft.caption.trim() } : {}),
      });
    }
  }
  return blocks;
}

export default function EditLessonScreen() {
  const { id, lessonId } = useLocalSearchParams<{ id: string; lessonId: string }>();
  const { t } = useTranslation();
  const editor = useEditor(id);
  const course = editor.document?.format === COURSE_FORMAT ? editor.document : null;
  const lesson = course?.lessons.find((candidate) => candidate.id === lessonId) ?? null;

  return (
    <Page>
      <Stack.Screen options={{ title: t('editor.lesson.screen') }} />
      {editor.loading ? <Loading /> : course && lesson ? (
        <LessonEditor course={course} lesson={lesson} save={editor.save} />
      ) : (
        <EmptyState icon="close" title={t('study.missing')} body="" />
      )}
    </Page>
  );
}

type Props = { course: Course; lesson: Lesson; save: (next: Course) => Promise<ParseIssue[]> };

function LessonEditor({ course, lesson, save }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors } = useTheme();
  const { apply, snackbar, dismiss } = useApply(course, (next) => save(next as Course));

  const [title, setTitle] = useState(lesson.title);
  const [summary, setSummary] = useState(lesson.summary ?? '');
  const [minutes, setMinutes] = useState(lesson.minutes ? String(lesson.minutes) : '');
  const [blocks, setBlocks] = useState<BlockDraft[]>(() => lesson.blocks.map(toDraft));
  const [issues, setIssues] = useState<ParseIssue[]>([]);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState(false);
  const [choosingMode, setChoosingMode] = useState(false);

  const editBlocks = (next: BlockDraft[]) => {
    setBlocks(next);
    setSaved(false);
  };
  const setBlock = (index: number, changes: Partial<BlockDraft>) =>
    editBlocks(blocks.map((block, position) => (position === index ? { ...block, ...changes } : block)));
  const moveBlock = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    const [block] = next.splice(index, 1);
    next.splice(target, 0, block);
    editBlocks(next);
  };

  /** The lesson as typed, with its assessments taken from the stored course so they are never lost. */
  const typedLesson = (): Lesson => {
    const next: Lesson = { id: lesson.id, title, blocks: fromDrafts(blocks), assessments: lesson.assessments };
    if (summary.trim()) next.summary = summary;
    if (minutes.trim()) next.minutes = Number(minutes);
    return next;
  };

  const saveLesson = () => {
    setFailed(false);
    save(putLesson(course, typedLesson()))
      .then((problems) => {
        setIssues(problems);
        setSaved(problems.length === 0);
      })
      .catch(() => setFailed(true));
  };

  const openAssessment = (assessmentId: string) =>
    router.push({ pathname: '/item/[id]/edit/assessment/[assessmentId]', params: { id: course.id, assessmentId } });

  const addAssessment = (mode: AssessmentMode) => {
    const assessmentId = freshId(course, `${lesson.id}-${mode}`);
    // Typed changes are saved together with the new assessment, so adding one never discards them.
    const withLesson = putLesson(course, typedLesson());
    void apply(putLessonAssessment(withLesson, lesson.id, { id: assessmentId, mode, passMark: 0.7, questions: [] })).then((ok) => {
      if (ok) openAssessment(assessmentId);
    });
  };

  return (
    <>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Field label={t('editor.title')}>
          <TextField
            value={title}
            onChangeText={(value) => {
              setTitle(value);
              setSaved(false);
            }}
            accessibilityLabel={t('editor.title')}
            maxLength={200}
          />
        </Field>
        <Field label={t('editor.lesson.summary')}>
          <TextField
            value={summary}
            onChangeText={(value) => {
              setSummary(value);
              setSaved(false);
            }}
            accessibilityLabel={t('editor.lesson.summary')}
            multiline
          />
        </Field>
        <Field label={t('editor.lesson.minutes')}>
          <TextField
            value={minutes}
            onChangeText={(value) => {
              setMinutes(value.replace(/[^0-9]/g, ''));
              setSaved(false);
            }}
            accessibilityLabel={t('editor.lesson.minutes')}
            keyboardType="number-pad"
            maxLength={3}
          />
        </Field>

        <Field label={t('editor.lesson.blocks')}>
          {blocks.length === 0 ? <AppText color="textSecondary">{t('editor.lesson.noBlocks')}</AppText> : null}
          {blocks.map((block, index) => {
            const name = `${t(`editor.lesson.block.${block.type}`)} ${index + 1}`;
            return (
              <View key={index} style={[styles.block, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={styles.blockHead}>
                  <AppText variant="label" color="textSecondary" style={styles.blockName}>
                    {name}
                  </AppText>
                  <IconButton icon="up" label={t('editor.moveUp', { name })} onPress={() => moveBlock(index, -1)} />
                  <IconButton icon="down" label={t('editor.moveDown', { name })} onPress={() => moveBlock(index, 1)} />
                  <IconButton icon="trash" label={t('editor.remove', { name })} onPress={() => editBlocks(blocks.filter((_, position) => position !== index))} />
                </View>

                {block.type === 'callout' ? (
                  <View style={styles.chips}>
                    {(['note', 'tip', 'warning'] as const).map((tone) => (
                      <Chip key={tone} label={t(`callout.${tone}`)} selected={block.tone === tone} onPress={() => setBlock(index, { tone })} />
                    ))}
                  </View>
                ) : null}
                {block.type === 'text' || block.type === 'callout' ? (
                  <TextField
                    value={block.markdown}
                    onChangeText={(markdown) => setBlock(index, { markdown })}
                    placeholder={t('editor.lesson.markdown')}
                    accessibilityLabel={`${name}: ${t('editor.lesson.markdown')}`}
                    multiline
                    textAlignVertical="top"
                    style={styles.large}
                  />
                ) : null}
                {block.type === 'code' ? (
                  <>
                    <TextField
                      value={block.language}
                      onChangeText={(language) => setBlock(index, { language })}
                      placeholder={t('editor.lesson.codeLanguage')}
                      accessibilityLabel={`${name}: ${t('editor.lesson.codeLanguage')}`}
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                    <TextField
                      value={block.code}
                      onChangeText={(code) => setBlock(index, { code })}
                      placeholder={t('editor.lesson.code')}
                      accessibilityLabel={`${name}: ${t('editor.lesson.code')}`}
                      multiline
                      textAlignVertical="top"
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={[styles.large, { fontFamily: monoFont }]}
                    />
                  </>
                ) : null}
                {block.type === 'image' ? (
                  <>
                    <TextField
                      value={block.url}
                      onChangeText={(url) => setBlock(index, { url })}
                      placeholder={t('editor.lesson.imageUrl')}
                      accessibilityLabel={`${name}: ${t('editor.lesson.imageUrl')}`}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                    />
                    <TextField value={block.alt} onChangeText={(alt) => setBlock(index, { alt })} placeholder={t('editor.lesson.imageAlt')} accessibilityLabel={`${name}: ${t('editor.lesson.imageAlt')}`} />
                    <TextField value={block.caption} onChangeText={(caption) => setBlock(index, { caption })} placeholder={t('editor.lesson.imageCaption')} accessibilityLabel={`${name}: ${t('editor.lesson.imageCaption')}`} />
                  </>
                ) : null}
              </View>
            );
          })}
          <View style={styles.chips}>
            {BLOCK_TYPES.map((type) => (
              <Button key={type} kind="secondary" icon="add" label={t(`editor.lesson.block.${type}`)} onPress={() => editBlocks([...blocks, emptyBlock(type)])} />
            ))}
          </View>
        </Field>

        <Field label={t('editor.lesson.assessments')}>
          {lesson.assessments.map((assessment) => (
            <StructureRow
              key={assessment.id}
              title={assessment.title ?? t(`mode.${assessment.mode}`)}
              subtitle={t('units.quiz', { count: assessment.questions.length })}
              onOpen={() => openAssessment(assessment.id)}
              onRemove={() => void apply(removeAssessment(course, assessment.id), t('editor.lesson.assessmentRemoved'))}
            />
          ))}
          <View style={styles.start}>
            <Button kind="secondary" icon="add" label={t('editor.lesson.addAssessment')} onPress={() => setChoosingMode(true)} />
          </View>
        </Field>
      </ScrollView>

      <SaveBar onSave={saveLesson} saved={saved} issues={issues} failed={failed} label={t('editor.lesson.save')} />
      <ActionSheet
        visible={choosingMode}
        title={t('editor.lesson.addAssessment')}
        onClose={() => setChoosingMode(false)}
        actions={(['practice', 'test'] as const).map((mode) => ({
          key: mode,
          icon: 'quiz',
          label: t(`mode.${mode}`),
          hint: t(`create.quizModeHint.${mode}`),
          onPress: () => addAssessment(mode),
        }))}
      />
      <Snackbar message={snackbar} onDismiss={dismiss} bottomOffset={96} />
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.xl },
  large: { minHeight: 120, paddingTop: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  block: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  blockHead: { flexDirection: 'row', alignItems: 'center' },
  blockName: { flex: 1 },
  start: { alignItems: 'flex-start' },
});
