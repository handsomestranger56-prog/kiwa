import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COURSE_FORMAT } from '@/core/schema';
import { lessonFile } from '@/core/transfer/files';
import { useData, useQuery } from '@/data/provider';
import { AssessmentCard } from '@/features/study/assessment-card';
import { LessonBlocks } from '@/features/study/blocks';
import { completeLesson, nextLessonId } from '@/features/study/completion';
import { shareTextFile } from '@/platform/files';
import { Button, IconButton, Tag } from '@/ui/controls';
import { EmptyState, Page } from '@/ui/layout';
import { ActionSheet } from '@/ui/overlays';
import { AppText } from '@/ui/text';
import { spacing, useTheme } from '@/ui/theme';

export default function LessonScreen() {
  const { id, lessonId } = useLocalSearchParams<{ id: string; lessonId: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const data = useData();
  const [failed, setFailed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const loaded = useQuery(`lesson:${id}:${lessonId}`, async ({ library, attempts }) => {
    const document = await library.getDocument(id);
    if (!document || document.format !== COURSE_FORMAT) return null;
    const index = document.lessons.findIndex((candidate) => candidate.id === lessonId);
    if (index < 0) return null;
    const [summaries, records] = await Promise.all([library.lessons(id), attempts.records(id)]);
    return {
      course: document,
      lesson: document.lessons[index],
      number: index + 1,
      marks: summaries[index],
      records,
    };
  });

  // Remember this lesson so "Continue" on the course brings the learner back here.
  useEffect(() => {
    data.library.setLastLesson(id, lessonId).catch(() => {});
  }, [data, id, lessonId]);

  if (loaded.loading) return <Page />;
  if (!loaded.data) {
    return (
      <Page>
        <Stack.Screen options={{ title: '' }} />
        <EmptyState icon="close" title={t('study.missing')} body="" />
      </Page>
    );
  }

  const { course, lesson, number, marks, records } = loaded.data;
  const next = nextLessonId(course, lesson.id);
  const completed = marks?.completed ?? false;
  const bookmarked = marks?.bookmarked ?? false;

  const openLesson = (target: string) =>
    router.replace({ pathname: '/item/[id]/lesson/[lessonId]', params: { id, lessonId: target } });

  const exportLesson = () => {
    const file = lessonFile(lesson, course.id);
    setSaved(null);
    shareTextFile(file)
      .then((result) => {
        if (result === 'unavailable') setFailed(true);
        else if (result === 'downloaded') setSaved(file.name);
      })
      .catch(() => setFailed(true));
  };
  const createFrom = (kind: 'quiz' | 'deck') =>
    router.push({ pathname: '/create', params: { kind, fromItem: id, fromLesson: lesson.id } });

  const complete = () => {
    setFailed(false);
    completeLesson(data, course, lesson.id)
      .then((target) => (target ? openLesson(target) : router.back()))
      .catch(() => setFailed(true));
  };

  return (
    <Page>
      <Stack.Screen
        options={{
          title: t('lesson.number', { current: number, total: course.lessons.length }),
          headerRight: () => (
            <View style={styles.headerButtons}>
              <IconButton
                icon={bookmarked ? 'bookmarkFilled' : 'bookmark'}
                color={bookmarked ? 'warm' : 'textSecondary'}
                selected={bookmarked}
                label={bookmarked ? t('item.removeBookmark') : t('item.bookmark')}
                onPress={() => {
                  data.library
                    .setLessonMark(id, lesson.id, 'bookmark', !bookmarked)
                    .catch(() => setFailed(true));
                }}
              />
              <IconButton
                icon="more"
                label={t('lesson.actions')}
                onPress={() => setMenuOpen(true)}
              />
            </View>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.intro}>
          <AppText variant="title" accessibilityRole="header">
            {lesson.title}
          </AppText>
          {lesson.minutes ? (
            <AppText variant="small" color="textSecondary">
              {t('item.minutes', { count: lesson.minutes })}
            </AppText>
          ) : null}
          {completed ? <Tag tone="accent" label={t('common.completed')} /> : null}
        </View>

        {lesson.blocks.length > 0 ? (
          <LessonBlocks blocks={lesson.blocks} />
        ) : (
          <AppText color="textSecondary">{t('lesson.empty')}</AppText>
        )}

        {lesson.assessments.length > 0 ? (
          <View style={styles.section}>
            <AppText variant="label" color="textSecondary">
              {t('lesson.checkYourself')}
            </AppText>
            {lesson.assessments.map((assessment) => (
              <AssessmentCard
                key={assessment.id}
                itemId={id}
                assessment={assessment}
                record={records[assessment.id]}
              />
            ))}
          </View>
        ) : null}

        {saved ? <AppText color="accent">{t('actions.exported', { name: saved })}</AppText> : null}
        {failed ? <AppText color="danger">{t('errors.generic')}</AppText> : null}
      </ScrollView>

      <ActionSheet
        visible={menuOpen}
        title={lesson.title}
        onClose={() => setMenuOpen(false)}
        actions={[
          {
            key: 'quiz',
            icon: 'quiz',
            label: t('lesson.makeQuiz'),
            onPress: () => createFrom('quiz'),
          },
          {
            key: 'deck',
            icon: 'deck',
            label: t('lesson.makeDeck'),
            onPress: () => createFrom('deck'),
          },
          { key: 'export', icon: 'share', label: t('lesson.export'), onPress: exportLesson },
        ]}
      />

      <View
        style={[
          styles.bar,
          {
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            paddingBottom: Math.max(insets.bottom, spacing.md),
          },
        ]}
      >
        {completed ? (
          next ? (
            <Button label={t('lesson.next')} onPress={() => openLesson(next)} />
          ) : (
            <Button
              kind="secondary"
              label={t('lesson.backToCourse')}
              onPress={() => router.back()}
            />
          )
        ) : (
          <Button
            icon="check"
            label={next ? t('lesson.completeAndContinue') : t('lesson.complete')}
            onPress={complete}
          />
        )}
      </View>
    </Page>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.xl },
  headerButtons: { flexDirection: 'row', alignItems: 'center' },
  intro: { gap: spacing.sm },
  section: { gap: spacing.sm },
  bar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
