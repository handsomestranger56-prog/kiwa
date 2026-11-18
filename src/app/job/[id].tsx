import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type Job, type Outline, approveOutline, missingLessons, nextStep } from '@/core/generate/plan';
import { type Course, type LibraryDocument, COURSE_FORMAT, kindOf, unitCount } from '@/core/schema';
import { appendLesson, asCopy } from '@/core/transfer/files';
import { useData, useQuery } from '@/data/provider';
import { Field } from '@/features/editor/parts';
import { useJobRunner, useJobWait } from '@/features/ai/job-runner';
import { ModelPicker, formatUsage, useModelChoices } from '@/features/ai/model-picker';
import type { ModelChoice } from '@/data/providers-repository';
import { Button, IconButton, Tag, TextField } from '@/ui/controls';
import { EmptyState, Loading, Page } from '@/ui/layout';
import { ConfirmDialog } from '@/ui/overlays';
import { AppText } from '@/ui/text';
import { monoFont, radius, spacing, useTheme } from '@/ui/theme';
import { openNewItem } from '@/features/library/open-item';

export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const loaded = useQuery(`job:${id}`, ({ jobs }) => jobs.get(id));

  return (
    <Page>
      <Stack.Screen options={{ title: t('job.title') }} />
      {loaded.loading ? <Loading /> : loaded.data ? <JobView job={loaded.data} /> : <EmptyState icon="close" title={t('study.missing')} body="" />}
    </Page>
  );
}

function JobView({ job }: { job: Job }) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const data = useData();
  const runner = useJobRunner();
  const [failed, setFailed] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const models = useModelChoices();
  const [nextModel, setNextModel] = useState<ModelChoice | null>(null);
  const waitingUntil = useJobWait(job.id);
  const secondsLeft = useSecondsUntil(waitingUntil);

  const { request, state, status } = job;
  const topic = request.topic.split('\n')[0];
  const usage = state.usage;

  /** Tries again from the last finished step, with another model if one was picked. */
  const retry = () => {
    setFailed(false);
    const model = nextModel ? { providerId: nextModel.providerId, model: nextModel.model, label: nextModel.label } : undefined;
    data.jobs
      .update(job.id, { status: state.outline && state.lessons.length === 0 ? 'outline' : 'running', error: null, model })
      .then(() => runner.start(job.id))
      .catch(() => setFailed(true));
  };

  const discard = () => {
    data.jobs
      .remove(job.id)
      .then(() => router.back())
      .catch(() => setFailed(true));
  };

  const addToLibrary = async () => {
    setFailed(false);
    try {
      const result = state.result;
      if (!result) return;
      let itemId: string;
      if ('lesson' in result) {
        const courseId = request.course?.id;
        const course = courseId ? await data.library.getDocument(courseId) : null;
        if (!course || course.format !== COURSE_FORMAT) throw new Error('course missing');
        await data.library.replace(appendLesson(course as Course, result.lesson));
        itemId = course.id;
      } else {
        const document: LibraryDocument = (await data.library.exists(result.document.id)) ? asCopy(result.document, '') : result.document;
        itemId = (await data.library.add(document, 'generated')).id;
      }
      await data.jobs.update(job.id, { status: 'saved', savedItemId: itemId });
      openNewItem(itemId);
    } catch {
      setFailed(true);
    }
  };

  const step = nextStep(job);
  const progress =
    status !== 'running'
      ? null
      : step?.type === 'outline'
        ? t('job.step.outline')
        : step?.type === 'lesson'
          ? t('job.step.lessons', { done: state.lessons.length - missingLessons(state).length, total: state.lessons.length })
          : step?.type === 'finalExam'
            ? t('job.step.exam')
            : step?.type === 'assemble'
              ? t('job.step.assemble')
              : t(`job.step.single.${request.kind}`);

  return (
    <>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
        <View style={styles.intro}>
          <Tag tone="accent" label={t(`create.kind.${request.kind}`)} />
          <AppText variant="heading">{topic}</AppText>
          <AppText variant="small" color="textSecondary">
            {t('job.model', { model: job.model.label })}
          </AppText>
        </View>

        {status === 'running' ? (
          <View style={styles.running} accessibilityLiveRegion="polite">
            <ActivityIndicator color={colors.accent} />
            <AppText style={styles.grow}>{progress}</AppText>
          </View>
        ) : null}
        {status === 'running' && secondsLeft !== null ? (
          <AppText color="warm" accessibilityLiveRegion="polite">
            {t('job.waiting', { seconds: secondsLeft })}
          </AppText>
        ) : null}
        {status === 'running' ? <AppText color="textSecondary">{t('job.background')}</AppText> : null}

        {status === 'outline' && state.outline ? <OutlineEditor job={job} outline={state.outline} /> : null}

        {status === 'ready' && state.result ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <AppText variant="label" color="accent">
              {t('job.ready')}
            </AppText>
            {'document' in state.result ? (
              <>
                <AppText variant="heading">{state.result.document.title}</AppText>
                <AppText color="textSecondary">
                  {t(`units.${kindOf(state.result.document)}`, { count: unitCount(state.result.document) })}
                </AppText>
                {state.result.document.description ? <AppText>{state.result.document.description}</AppText> : null}
                {state.result.document.format === COURSE_FORMAT ? (
                  <View style={styles.list}>
                    {state.result.document.lessons.map((lesson, index) => (
                      <AppText key={lesson.id}>
                        {index + 1}. {lesson.title}
                      </AppText>
                    ))}
                    {state.result.document.finalExam ? null : <AppText color="warm">{t('job.noExam')}</AppText>}
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <AppText variant="heading">{state.result.lesson.title}</AppText>
                <AppText color="textSecondary">{t('job.lessonFor', { course: request.course?.title ?? '' })}</AppText>
              </>
            )}
            <View style={styles.row}>
              <Button icon="add" label={t('import.add')} onPress={() => void addToLibrary()} />
              <Button kind="secondary" label={t('job.discard')} onPress={() => setConfirmingDiscard(true)} />
            </View>
          </View>
        ) : null}

        {status === 'saved' && job.savedItemId ? (
          <View style={styles.row}>
            <AppText color="accent">{t('job.saved')}</AppText>
            <Button kind="secondary" label={t('job.open')} onPress={() => openNewItem(job.savedItemId ?? '')} />
          </View>
        ) : null}

        {status === 'failed' && job.error ? (
          <View style={[styles.card, { backgroundColor: colors.dangerSoft, borderColor: colors.danger }]}>
            <AppText variant="heading">{t('job.failed')}</AppText>
            <AppText>{job.error.kind === 'invalid' ? t('job.invalid') : t(`ai.error.${job.error.kind as 'network'}`, { defaultValue: job.error.message })}</AppText>
            <AppText variant="small" color="textSecondary" selectable>
              {job.error.message}
            </AppText>
            {job.error.issues?.slice(0, 5).map((issue, index) => (
              <AppText key={index} variant="small" style={{ fontFamily: monoFont }}>
                {issue.path}: {issue.message}
              </AppText>
            ))}
            {job.error.kind === 'rate' ? <AppText>{t('job.limitHint')}</AppText> : null}
            <AppText color="textSecondary">{t('job.keptSteps')}</AppText>
            {models && models.choices.length > 1 ? (
              <View style={styles.list}>
                <AppText variant="label" color="textSecondary">
                  {t('job.retryWith')}
                </AppText>
                <ModelPicker options={models} value={nextModel ?? models.choices.find((choice) => choice.providerId === job.model.providerId && choice.model === job.model.model) ?? null} onChange={setNextModel} />
              </View>
            ) : null}
            <View style={styles.row}>
              <Button icon="restore" label={t('job.retry')} onPress={retry} />
              <Button kind="secondary" label={t('job.discard')} onPress={() => setConfirmingDiscard(true)} />
            </View>
          </View>
        ) : null}

        {usage.requests > 0 ? (
          <AppText variant="small" color="textSecondary">
            {formatUsage(usage)} · {t('job.requests', { count: usage.requests })}
            {usage.failed ? `, ${t('job.requestsFailed', { count: usage.failed })}` : ''}
          </AppText>
        ) : null}
        {state.fixes.length > 0 ? (
          <AppText variant="small" color="textSecondary">
            {t('job.fixes', { count: state.fixes.length })}
          </AppText>
        ) : null}
        {failed ? <AppText color="danger">{t('errors.generic')}</AppText> : null}
      </ScrollView>

      <ConfirmDialog
        visible={confirmingDiscard}
        danger
        title={t('job.discardTitle')}
        body={t('job.discardBody')}
        confirmLabel={t('job.discard')}
        cancelLabel={t('common.cancel')}
        onConfirm={discard}
        onClose={() => setConfirmingDiscard(false)}
      />
    </>
  );
}

/** Whole seconds until a time, ticking once a second. Null when there is no time to count to. */
function useSecondsUntil(until: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === null) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [until]);
  return until === null ? null : Math.max(0, Math.ceil((until - now) / 1000));
}

/** The planned lessons, editable before anything expensive runs. */
function OutlineEditor({ job, outline }: { job: Job; outline: Outline }) {
  const { t } = useTranslation();
  const data = useData();
  const runner = useJobRunner();
  const [draft, setDraft] = useState<Outline>(outline);
  const [problem, setProblem] = useState(false);

  const setLesson = (index: number, changes: Partial<Outline['lessons'][number]>) =>
    setDraft({ ...draft, lessons: draft.lessons.map((lesson, position) => (position === index ? { ...lesson, ...changes } : lesson)) });
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= draft.lessons.length) return;
    const lessons = [...draft.lessons];
    const [lesson] = lessons.splice(index, 1);
    lessons.splice(target, 0, lesson);
    setDraft({ ...draft, lessons });
  };

  const approve = () => {
    const lessons = draft.lessons.filter((lesson) => lesson.title.trim()).map((lesson) => ({ ...lesson, title: lesson.title.trim() }));
    if (!draft.title.trim() || lessons.length === 0) {
      setProblem(true);
      return;
    }
    data.jobs
      .update(job.id, { status: 'running', state: approveOutline(job.state, { ...draft, title: draft.title.trim(), lessons }) })
      .then(() => runner.start(job.id))
      .catch(() => setProblem(true));
  };

  return (
    <View style={styles.outline}>
      <AppText>{t('job.outlineIntro')}</AppText>
      <Field label={t('job.courseTitle')}>
        <TextField value={draft.title} onChangeText={(title) => setDraft({ ...draft, title })} accessibilityLabel={t('job.courseTitle')} />
      </Field>
      <Field label={t('item.lessons')}>
        {draft.lessons.map((lesson, index) => {
          const name = t('job.lessonTitle', { number: index + 1 });
          return (
            <View key={index} style={styles.outlineRow}>
              <View style={styles.grow}>
                <TextField value={lesson.title} onChangeText={(title) => setLesson(index, { title })} accessibilityLabel={name} />
                {lesson.summary ? (
                  <AppText variant="small" color="textSecondary">
                    {lesson.summary}
                  </AppText>
                ) : null}
              </View>
              <IconButton icon="up" label={t('editor.moveUp', { name })} onPress={() => move(index, -1)} />
              <IconButton icon="trash" label={t('editor.remove', { name })} onPress={() => setDraft({ ...draft, lessons: draft.lessons.filter((_, position) => position !== index) })} />
            </View>
          );
        })}
        <View style={styles.start}>
          <Button kind="plain" icon="add" label={t('editor.addLesson')} onPress={() => setDraft({ ...draft, lessons: [...draft.lessons, { title: '' }] })} />
        </View>
      </Field>
      {problem ? <AppText color="danger">{t('job.outlineProblem')}</AppText> : null}
      <View style={styles.start}>
        <Button icon="ai" label={t('job.writeLessons', { count: draft.lessons.filter((lesson) => lesson.title.trim()).length })} onPress={approve} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.lg },
  intro: { gap: spacing.xs },
  running: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  list: { gap: 2 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  outline: { gap: spacing.lg },
  outlineRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  grow: { flex: 1, minWidth: 0, gap: spacing.xs },
  start: { alignItems: 'flex-start' },
});
