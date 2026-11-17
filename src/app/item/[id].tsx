import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type Assessment, type LibraryDocument, type Question, COURSE_FORMAT, QUIZ_FORMAT } from '@/core/schema';
import type { LessonSummary, LibraryItem } from '@/data/library-repository';
import { useData, useQuery } from '@/data/provider';
import { useItemActions } from '@/features/library/item-actions';
import { Button, IconButton, Tag } from '@/ui/controls';
import { Divider, EmptyState, Page } from '@/ui/layout';
import { Snackbar } from '@/ui/overlays';
import { AppText } from '@/ui/text';
import { radius, spacing, useTheme } from '@/ui/theme';

type Loaded = { item: LibraryItem; document: LibraryDocument; lessons: LessonSummary[] } | null;

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { library } = useData();

  const loaded = useQuery<Loaded>(`item:${id}`, async (data) => {
    const item = await data.library.get(id);
    const document = item ? await data.library.getDocument(id) : null;
    if (!item || !document) return null;
    const lessons = item.kind === 'course' ? await data.library.lessons(id) : [];
    return { item, document, lessons };
  });

  const actions = useItemActions({ onRemoved: () => router.back() });
  const current = loaded.data;

  if (loaded.loading) {
    return <Page />;
  }
  if (!current) {
    return (
      <Page>
        <EmptyState icon="close" title={t('item.notFound')} body={loaded.error?.message ?? ''} />
      </Page>
    );
  }

  const { item, document, lessons } = current;
  const meta = [
    t(`units.${item.kind}`, { count: item.unitCount }),
    item.level ? t(`level.${item.level}`) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Page>
      <Stack.Screen
        options={{
          title: t(`kind.${item.kind}`),
          headerRight: item.deletedAt
            ? undefined
            : () => (
                <View style={styles.headerButtons}>
                  <IconButton
                    icon={item.favorite ? 'starFilled' : 'star'}
                    color={item.favorite ? 'warm' : 'textSecondary'}
                    selected={item.favorite}
                    label={item.favorite ? t('actions.removeFavorite') : t('actions.addFavorite')}
                    onPress={() => actions.toggleFavorite(item)}
                  />
                  <IconButton icon="more" label={t('actions.more')} onPress={() => actions.open(item)} />
                </View>
              ),
        }}
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
        <View style={styles.intro}>
          <AppText variant="title" accessibilityRole="header">
            {item.title}
          </AppText>
          <AppText variant="small" color="textSecondary">
            {meta}
          </AppText>
          {item.description ? <AppText>{item.description}</AppText> : null}
          {item.completed || item.tags.length > 0 ? (
            <View style={styles.tags}>
              {item.completed ? <Tag tone="accent" label={t('common.completed')} /> : null}
              {item.tags.map((tag) => (
                <Tag key={tag} label={tag} />
              ))}
            </View>
          ) : null}
        </View>

        {item.deletedAt ? (
          <View style={styles.notice}>
            <AppText color="textSecondary">{t('item.inTrash')}</AppText>
            <Button kind="secondary" icon="restore" label={t('item.restore')} onPress={() => library.restore(item.id).catch(actions.showError)} />
          </View>
        ) : null}

        {document.format === COURSE_FORMAT ? (
          <>
            <Section title={t('item.lessons')} empty={lessons.length === 0 ? t('item.emptyCourse') : null}>
              {lessons.map((lesson, index) => (
                <LessonRow
                  key={lesson.id}
                  number={index + 1}
                  lesson={lesson}
                  onToggleDone={() =>
                    library.setLessonMark(item.id, lesson.id, 'completed', !lesson.completed).catch(actions.showError)
                  }
                  onToggleBookmark={() =>
                    library.setLessonMark(item.id, lesson.id, 'bookmark', !lesson.bookmarked).catch(actions.showError)
                  }
                />
              ))}
            </Section>
            {document.finalExam ? (
              <Section title={t('item.finalExam')} empty={null}>
                <AssessmentSummary assessment={document.finalExam} />
              </Section>
            ) : null}
          </>
        ) : document.format === QUIZ_FORMAT ? (
          <Section
            title={t('item.questions')}
            empty={document.assessment.questions.length === 0 ? t('item.emptyQuiz') : null}>
            <AssessmentSummary assessment={document.assessment} />
            <QuestionList questions={document.assessment.questions} />
          </Section>
        ) : (
          <Section title={t('item.cards')} empty={document.cards.length === 0 ? t('item.emptyDeck') : null}>
            <QuestionList questions={document.cards} />
          </Section>
        )}
      </ScrollView>
      {actions.overlays}
      <Snackbar message={actions.snackbar} onDismiss={actions.dismissSnackbar} />
    </Page>
  );
}

function Section({ title, empty, children }: { title: string; empty: string | null; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <AppText variant="label" color="textSecondary">
        {title}
      </AppText>
      {empty ? (
        <AppText color="textSecondary">{empty}</AppText>
      ) : (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>{children}</View>
      )}
    </View>
  );
}

type LessonRowProps = {
  number: number;
  lesson: LessonSummary;
  onToggleDone: () => void;
  onToggleBookmark: () => void;
};

function LessonRow({ number, lesson, onToggleDone, onToggleBookmark }: LessonRowProps) {
  const { t } = useTranslation();
  const meta = [
    lesson.minutes ? t('item.minutes', { count: lesson.minutes }) : null,
    lesson.questionCount > 0 ? t('units.quiz', { count: lesson.questionCount }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      {number > 1 ? <Divider /> : null}
      <View style={styles.lesson}>
        <IconButton
          icon={lesson.completed ? 'checkCircle' : 'circle'}
          color={lesson.completed ? 'accent' : 'textSecondary'}
          selected={lesson.completed}
          label={lesson.completed ? t('item.markLessonNotDone') : t('item.markLessonDone')}
          onPress={onToggleDone}
        />
        <View style={styles.lessonText}>
          <AppText variant="bodyStrong">
            {number}. {lesson.title}
          </AppText>
          {lesson.summary ? (
            <AppText variant="small" color="textSecondary">
              {lesson.summary}
            </AppText>
          ) : null}
          {meta ? (
            <AppText variant="small" color="textSecondary">
              {meta}
            </AppText>
          ) : null}
        </View>
        <IconButton
          icon={lesson.bookmarked ? 'bookmarkFilled' : 'bookmark'}
          color={lesson.bookmarked ? 'warm' : 'textSecondary'}
          selected={lesson.bookmarked}
          label={lesson.bookmarked ? t('item.removeBookmark') : t('item.bookmark')}
          onPress={onToggleBookmark}
        />
      </View>
    </>
  );
}

function AssessmentSummary({ assessment }: { assessment: Assessment }) {
  const { t } = useTranslation();
  const parts = [
    t(`mode.${assessment.mode}`),
    t('units.quiz', { count: assessment.questions.length }),
    assessment.mode === 'practice' ? null : t('item.passMark', { percent: Math.round(assessment.passMark * 100) }),
    assessment.timeLimitMinutes ? t('item.minutes', { count: assessment.timeLimitMinutes }) : null,
  ].filter(Boolean);
  return (
    <View style={styles.summary}>
      <AppText variant="small" color="textSecondary">
        {parts.join(' · ')}
      </AppText>
    </View>
  );
}

function QuestionList({ questions }: { questions: readonly Question[] }) {
  const { t } = useTranslation();
  return (
    <>
      {questions.map((question, index) => (
        <View key={question.id}>
          <Divider />
          <View style={styles.question}>
            <AppText>
              {index + 1}. {question.prompt}
            </AppText>
            {question.type === 'flashcard' ? null : (
              <AppText variant="small" color="textSecondary">
                {t(`questionType.${question.type}`)}
              </AppText>
            )}
          </View>
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.xl },
  headerButtons: { flexDirection: 'row', alignItems: 'center' },
  intro: { gap: spacing.sm },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  notice: { gap: spacing.sm, alignItems: 'flex-start' },
  section: { gap: spacing.sm },
  card: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  lesson: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.xs },
  lessonText: { flex: 1, minWidth: 0, gap: 2 },
  summary: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  question: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, gap: 2 },
});
