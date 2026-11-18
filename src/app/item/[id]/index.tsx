import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DECK_ASSESSMENT_ID, findAssessment } from '@/core/quiz/session';
import { type Flashcard, COURSE_FORMAT, DECK_FORMAT, QUIZ_FORMAT } from '@/core/schema';
import type { LessonSummary } from '@/data/library-repository';
import { useData, useQuery } from '@/data/provider';
import { useItemActions } from '@/features/library/item-actions';
import { AssessmentCard } from '@/features/study/assessment-card';
import { resumeLessonId } from '@/features/study/completion';
import { Button, IconButton, Tag } from '@/ui/controls';
import { Divider, EmptyState, Loading, Page } from '@/ui/layout';
import { Snackbar } from '@/ui/overlays';
import { AppText } from '@/ui/text';
import { radius, spacing, useTheme } from '@/ui/theme';

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { library } = useData();

  const loaded = useQuery(`item:${id}`, async (data) => {
    const item = await data.library.get(id);
    const document = item ? await data.library.getDocument(id) : null;
    if (!item || !document) return null;
    const [lessons, lastLesson, records] = await Promise.all([
      item.kind === 'course' ? data.library.lessons(id) : [],
      data.library.lastLesson(id),
      data.attempts.records(id),
    ]);
    return { item, document, lessons, lastLesson, records };
  });

  const actions = useItemActions({ onRemoved: () => router.back() });
  const current = loaded.data;

  if (loaded.loading) {
    return <Loading />;
  }
  if (!current) {
    return (
      <Page>
        <Stack.Screen options={{ title: '' }} />
        <EmptyState icon="close" title={t('item.notFound')} body={loaded.error?.message ?? ''} />
      </Page>
    );
  }

  const { item, document, lessons, lastLesson, records } = current;
  const meta = [t(`units.${item.kind}`, { count: item.unitCount }), item.level ? t(`level.${item.level}`) : null]
    .filter(Boolean)
    .join(' · ');

  const openLesson = (lessonId: string) =>
    router.push({ pathname: '/item/[id]/lesson/[lessonId]', params: { id: item.id, lessonId } });
  const resumeAt = resumeLessonId(lessons, lastLesson);
  const started = lastLesson !== null || lessons.some((lesson) => lesson.completed);
  const deckRound = document.format === DECK_FORMAT ? findAssessment(document, DECK_ASSESSMENT_ID) : null;

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
            <Button
              kind="secondary"
              icon="restore"
              label={t('item.restore')}
              onPress={() => library.restore(item.id).catch(actions.showError)}
            />
          </View>
        ) : null}

        {document.format === COURSE_FORMAT ? (
          <>
            {resumeAt ? (
              <View style={styles.start}>
                <Button
                  icon="play"
                  label={started ? t('study.continue') : t('study.startCourse')}
                  onPress={() => openLesson(resumeAt)}
                />
              </View>
            ) : null}
            <Section title={t('item.lessons')} empty={lessons.length === 0 ? t('item.emptyCourse') : null}>
              {lessons.map((lesson, index) => (
                <LessonRow
                  key={lesson.id}
                  number={index + 1}
                  lesson={lesson}
                  onOpen={() => openLesson(lesson.id)}
                  onToggleDone={() =>
                    library.setLessonMark(item.id, lesson.id, 'completed', !lesson.completed).catch(actions.showError)
                  }
                  onToggleBookmark={() =>
                    library.setLessonMark(item.id, lesson.id, 'bookmark', !lesson.bookmarked).catch(actions.showError)
                  }
                />
              ))}
            </Section>
            <View style={styles.start}>
              <Button
                kind="secondary"
                icon="ai"
                label={t('item.addLesson')}
                onPress={() => router.push({ pathname: '/create', params: { kind: 'lesson', course: item.id } })}
              />
            </View>
            {document.finalExam ? (
              <View style={styles.section}>
                <AppText variant="label" color="textSecondary">
                  {t('item.finalExam')}
                </AppText>
                <AssessmentCard itemId={item.id} assessment={document.finalExam} record={records[document.finalExam.id]} />
              </View>
            ) : null}
          </>
        ) : document.format === QUIZ_FORMAT ? (
          document.assessment.questions.length === 0 ? (
            <AppText color="textSecondary">{t('item.emptyQuiz')}</AppText>
          ) : (
            <AssessmentCard itemId={item.id} assessment={document.assessment} record={records[document.assessment.id]} />
          )
        ) : (
          <>
            {deckRound && document.cards.length > 0 ? (
              <AssessmentCard
                itemId={item.id}
                assessment={deckRound.assessment}
                record={records[DECK_ASSESSMENT_ID]}
                title={t('study.studyAll')}
              />
            ) : null}
            <Section title={t('item.cards')} empty={document.cards.length === 0 ? t('item.emptyDeck') : null}>
              <CardList cards={document.cards} />
            </Section>
          </>
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
  onOpen: () => void;
  onToggleDone: () => void;
  onToggleBookmark: () => void;
};

function LessonRow({ number, lesson, onOpen, onToggleDone, onToggleBookmark }: LessonRowProps) {
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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('item.openLesson', { number, title: lesson.title })}
          onPress={onOpen}
          style={({ pressed }) => [styles.lessonText, pressed && styles.pressed]}>
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
        </Pressable>
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

function CardList({ cards }: { cards: readonly Flashcard[] }) {
  return (
    <>
      {cards.map((card, index) => (
        <View key={card.id}>
          {index > 0 ? <Divider /> : null}
          <View style={styles.cardRow}>
            <AppText>
              {index + 1}. {card.prompt}
            </AppText>
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
  start: { alignItems: 'flex-start' },
  section: { gap: spacing.sm },
  card: { borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  lesson: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.xs },
  lessonText: { flex: 1, minWidth: 0, gap: 2, paddingVertical: spacing.xs },
  pressed: { opacity: 0.6 },
  cardRow: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
});
