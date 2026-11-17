import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type Level, COURSE_FORMAT, levelSchema } from '@/core/schema';
import { lessonText } from '@/core/transfer/files';
import {
  type CreateKind,
  type CreateRequest,
  CREATE_KINDS,
  LIMITS,
  PROMPT_QUESTION_TYPES,
  buildPrompt,
  defaultRequest,
  promptFileName,
} from '@/core/transfer/prompt';
import { useData, useQuery } from '@/data/provider';
import i18n from '@/i18n';
import { copyText, shareTextFile } from '@/platform/files';
import { Button, Chip, Stepper, TextField } from '@/ui/controls';
import { Page } from '@/ui/layout';
import { AppText } from '@/ui/text';
import { monoFont, radius, spacing, useTheme } from '@/ui/theme';

type CourseOption = { id: string; title: string };
type Prompt = { text: string; fileName: string };

export default function CreateScreen() {
  const params = useLocalSearchParams<{ kind?: string; fromItem?: string; fromLesson?: string; course?: string }>();
  const { t } = useTranslation();

  // Starting values can come from a lesson ("make a quiz from this lesson") or a course ("add a lesson").
  const seed = useQuery(`create:${params.fromItem ?? ''}:${params.fromLesson ?? ''}`, async ({ library }) => {
    const courses: CourseOption[] = (await library.list({ kind: 'course' })).map((item) => ({ id: item.id, title: item.title }));
    const initial: CreateRequest = { ...defaultRequest, language: i18n.language.split('-')[0] || 'en' };

    const kind = CREATE_KINDS.find((candidate) => candidate === params.kind);
    if (kind) initial.kind = kind;

    if (params.fromItem && params.fromLesson) {
      const document = await library.getDocument(params.fromItem);
      const lesson = document?.format === COURSE_FORMAT ? document.lessons.find((candidate) => candidate.id === params.fromLesson) : null;
      if (document && lesson) {
        initial.topic = lesson.title;
        initial.source = lessonText(lesson);
        initial.language = document.language;
        initial.level = document.level ?? initial.level;
      }
    }
    return { courses, initial, courseId: params.course ?? courses[0]?.id ?? null };
  });

  return (
    <Page>
      <Stack.Screen options={{ title: t('create.screenTitle') }} />
      {seed.data ? <CreateFlow courses={seed.data.courses} initial={seed.data.initial} initialCourseId={seed.data.courseId} /> : null}
    </Page>
  );
}

type FlowProps = { courses: CourseOption[]; initial: CreateRequest; initialCourseId: string | null };

function CreateFlow({ courses, initial, initialCourseId }: FlowProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { library } = useData();
  const [request, setRequest] = useState(initial);
  const [courseId, setCourseId] = useState(initialCourseId);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [failed, setFailed] = useState(false);

  const set = (changes: Partial<CreateRequest>) => setRequest((current) => ({ ...current, ...changes }));
  const lessonNeedsCourse = request.kind === 'lesson' && !courseId;
  const ready = request.topic.trim() !== '' && !lessonNeedsCourse;

  const makePrompt = async () => {
    setFailed(false);
    try {
      let complete = request;
      if (request.kind === 'lesson' && courseId) {
        const [item, lessons] = await Promise.all([library.get(courseId), library.lessons(courseId)]);
        if (item) complete = { ...request, course: { id: item.id, title: item.title, lessonTitles: lessons.map((lesson) => lesson.title) } };
      }
      setPrompt({ text: buildPrompt(complete), fileName: promptFileName(complete) });
    } catch {
      setFailed(true);
    }
  };

  if (prompt) {
    return <PromptReady prompt={prompt} kind={request.kind} courseId={request.kind === 'lesson' ? courseId : null} onEdit={() => setPrompt(null)} />;
  }

  const toggleType = (type: (typeof PROMPT_QUESTION_TYPES)[number]) => {
    const has = request.questionTypes.includes(type);
    // At least one type stays selected, otherwise there would be nothing to ask.
    if (has && request.questionTypes.length === 1) return;
    set({ questionTypes: has ? request.questionTypes.filter((entry) => entry !== type) : [...request.questionTypes, type] });
  };

  return (
    <>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Field label={t('create.what')}>
          <View style={styles.chips}>
            {CREATE_KINDS.map((kind: CreateKind) => (
              <Chip key={kind} label={t(`create.kind.${kind}`)} selected={request.kind === kind} onPress={() => set({ kind })} />
            ))}
          </View>
        </Field>

        {request.kind === 'lesson' ? (
          <Field label={t('create.forCourse')}>
            {courses.length === 0 ? (
              <AppText color="textSecondary">{t('create.noCourses')}</AppText>
            ) : (
              <View style={styles.chips}>
                {courses.map((course) => (
                  <Chip key={course.id} label={course.title} selected={courseId === course.id} onPress={() => setCourseId(course.id)} />
                ))}
              </View>
            )}
          </Field>
        ) : null}

        <Field label={t('create.topic')}>
          <TextField
            value={request.topic}
            onChangeText={(topic) => set({ topic })}
            placeholder={t(`create.topicPlaceholder.${request.kind}`)}
            accessibilityLabel={t('create.topic')}
            multiline
            maxLength={500}
            style={styles.topic}
          />
        </Field>

        <Field label={t('create.level')}>
          <View style={styles.chips}>
            {levelSchema.options.map((level: Level) => (
              <Chip key={level} label={t(`level.${level}`)} selected={request.level === level} onPress={() => set({ level })} />
            ))}
          </View>
        </Field>

        <Field label={t('create.size')}>
          {request.kind === 'course' ? (
            <Stepper label={t('create.lessons')} value={request.lessons} min={LIMITS.lessons[0]} max={LIMITS.lessons[1]} onChange={(lessons) => set({ lessons })} />
          ) : null}
          {request.kind === 'deck' ? (
            <Stepper label={t('create.cards')} value={request.cards} min={LIMITS.cards[0]} max={LIMITS.cards[1]} onChange={(cards) => set({ cards })} />
          ) : (
            <Stepper
              label={request.kind === 'quiz' ? t('create.questions') : t('create.questionsPerLesson')}
              value={request.questions}
              min={LIMITS.questions[0]}
              max={LIMITS.questions[1]}
              onChange={(questions) => set({ questions })}
            />
          )}
        </Field>

        {request.kind === 'quiz' ? (
          <Field label={t('create.quizMode')}>
            <View style={styles.chips}>
              {(['practice', 'test'] as const).map((mode) => (
                <Chip key={mode} label={t(`mode.${mode}`)} selected={request.quizMode === mode} onPress={() => set({ quizMode: mode })} />
              ))}
            </View>
            <AppText variant="small" color="textSecondary">
              {t(`create.quizModeHint.${request.quizMode === 'test' ? 'test' : 'practice'}`)}
            </AppText>
          </Field>
        ) : null}

        {request.kind === 'deck' ? null : (
          <Field label={t('create.questionTypes')}>
            <View style={styles.chips}>
              {PROMPT_QUESTION_TYPES.map((type) => (
                <Chip key={type} label={t(`questionType.${type}`)} selected={request.questionTypes.includes(type)} onPress={() => toggleType(type)} />
              ))}
            </View>
          </Field>
        )}

        <Field label={t('create.language')}>
          <TextField
            value={request.language}
            onChangeText={(language) => set({ language: language.trim() })}
            accessibilityLabel={t('create.language')}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={12}
          />
          <AppText variant="small" color="textSecondary">
            {t('create.languageHint')}
          </AppText>
        </Field>

        <Field label={t('create.audience')}>
          <TextField
            value={request.audience ?? ''}
            onChangeText={(audience) => set({ audience })}
            placeholder={t('create.audiencePlaceholder')}
            accessibilityLabel={t('create.audience')}
            maxLength={200}
          />
        </Field>

        <Field label={t('create.source')}>
          <TextField
            value={request.source ?? ''}
            onChangeText={(source) => set({ source })}
            placeholder={t('create.sourcePlaceholder')}
            accessibilityLabel={t('create.source')}
            multiline
            textAlignVertical="top"
            style={styles.source}
          />
          <AppText variant="small" color="textSecondary">
            {t('create.sourceHint')}
          </AppText>
        </Field>

        {failed ? <AppText color="danger">{t('errors.generic')}</AppText> : null}
      </ScrollView>

      <View style={[styles.bar, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <Button icon="file" label={t('create.promptForAi')} disabled={!ready} onPress={() => void makePrompt()} />
      </View>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <AppText variant="label" color="textSecondary">
        {label}
      </AppText>
      {children}
    </View>
  );
}

type PromptReadyProps = { prompt: Prompt; kind: CreateKind; courseId: string | null; onEdit: () => void };

function PromptReady({ prompt, kind, courseId, onEdit }: PromptReadyProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [status, setStatus] = useState<'copied' | 'downloaded' | 'failed' | null>(null);
  const [expanded, setExpanded] = useState(false);

  const copy = () => {
    copyText(prompt.text)
      .then(() => setStatus('copied'))
      .catch(() => setStatus('failed'));
  };
  const share = () => {
    shareTextFile({ name: prompt.fileName, text: prompt.text, mimeType: 'text/markdown' })
      .then((result) => setStatus(result === 'downloaded' ? 'downloaded' : result === 'unavailable' ? 'failed' : null))
      .catch(() => setStatus('failed'));
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.field}>
          <AppText variant="title" accessibilityRole="header">
            {t('prompt.title')}
          </AppText>
          <AppText color="textSecondary">{t(`prompt.intro.${kind}`)}</AppText>
        </View>

        <View style={styles.steps}>
          {(['copy', 'paste', 'import'] as const).map((step, index) => (
            <View key={step} style={styles.step}>
              <AppText variant="bodyStrong" color="accent" style={styles.stepNumber}>
                {index + 1}
              </AppText>
              <AppText style={styles.stepText}>{t(`prompt.steps.${step}`)}</AppText>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <Button icon="copy" label={t('prompt.copy')} onPress={copy} />
          <Button kind="secondary" icon="share" label={t('prompt.share')} onPress={share} />
        </View>
        {status ? (
          <AppText variant="small" color={status === 'failed' ? 'danger' : 'accent'} accessibilityLiveRegion="polite">
            {status === 'copied' ? t('prompt.copied') : status === 'downloaded' ? t('prompt.downloaded', { name: prompt.fileName }) : t('errors.generic')}
          </AppText>
        ) : null}

        <View style={styles.field}>
          <AppText variant="small" color="textSecondary" style={{ fontFamily: monoFont }}>
            {prompt.fileName}
          </AppText>
          <View style={[styles.preview, { backgroundColor: colors.surfaceAlt }]}>
            <AppText selectable variant="small" numberOfLines={expanded ? undefined : 12} style={{ fontFamily: monoFont }}>
              {prompt.text}
            </AppText>
          </View>
          <View style={styles.actions}>
            <Button kind="plain" label={expanded ? t('prompt.showLess') : t('prompt.showAll')} onPress={() => setExpanded(!expanded)} />
          </View>
        </View>
      </ScrollView>

      <View style={[styles.bar, styles.barSplit, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <Button kind="secondary" label={t('prompt.edit')} onPress={onEdit} />
        <Button
          icon="importFile"
          label={t('prompt.importReply')}
          onPress={() => router.push({ pathname: '/import', params: courseId ? { course: courseId } : {} })}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.xl },
  field: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  topic: { minHeight: 72, paddingTop: spacing.md },
  source: { minHeight: 120, paddingTop: spacing.md },
  bar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  barSplit: { justifyContent: 'space-between' },
  steps: { gap: spacing.md },
  step: { flexDirection: 'row', gap: spacing.md },
  stepNumber: { width: 20, textAlign: 'center' },
  stepText: { flex: 1, minWidth: 0 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  preview: { borderRadius: radius.md, padding: spacing.md },
});
