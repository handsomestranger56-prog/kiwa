import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { type Answer, type AnswerOf, ESSAY_RATINGS, FLASHCARD_RATINGS, answerFor, countWords } from '@/core/quiz/answers';
import { clozeSegments } from '@/core/quiz/cloze';
import { matchesAccepted } from '@/core/quiz/grading';
import type { Question } from '@/core/schema';
import { Button, Chip, TextField } from '@/ui/controls';
import { type IconName, Icon } from '@/ui/icon';
import { InlineMarkdown, Markdown } from '@/ui/markdown';
import { AppText } from '@/ui/text';
import { type ColorName, MIN_TOUCH, radius, spacing, useTheme } from '@/ui/theme';

type ViewProps<T extends Question['type']> = {
  question: Extract<Question, { type: T }>;
  answer: AnswerOf<T>;
  onChange: (answer: AnswerOf<T>) => void;
  /** The answer can no longer be changed. */
  locked: boolean;
  /** Show which parts are right and wrong. */
  revealed: boolean;
};

type Props = {
  question: Question;
  answer: Answer | undefined;
  onChange: (answer: Answer) => void;
  locked: boolean;
  revealed: boolean;
};

/** The answer area for any question type. Adding a type means adding a view here and a case in the grader. */
export function QuestionView({ question, answer, onChange, locked, revealed }: Props) {
  const current = answerFor(question, answer);
  const shared = { onChange, locked, revealed };

  switch (question.type) {
    case 'single_choice':
      return <SingleChoice question={question} answer={current as AnswerOf<'single_choice'>} {...shared} />;
    case 'multiple_choice':
      return <MultipleChoice question={question} answer={current as AnswerOf<'multiple_choice'>} {...shared} />;
    case 'true_false':
      return <TrueFalse question={question} answer={current as AnswerOf<'true_false'>} {...shared} />;
    case 'short_answer':
      return <ShortAnswer question={question} answer={current as AnswerOf<'short_answer'>} {...shared} />;
    case 'cloze':
      return <Cloze question={question} answer={current as AnswerOf<'cloze'>} {...shared} />;
    case 'essay':
      return <Essay question={question} answer={current as AnswerOf<'essay'>} {...shared} />;
    case 'flashcard':
      return <Flashcard question={question} answer={current as AnswerOf<'flashcard'>} {...shared} />;
  }
}

type OptionState = 'idle' | 'selected' | 'right' | 'wrong' | 'missed';

type OptionProps = {
  label: string;
  kind: 'radio' | 'checkbox';
  selected: boolean;
  state: OptionState;
  disabled: boolean;
  onPress: () => void;
};

function OptionRow({ label, kind, selected, state, disabled, onPress }: OptionProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const look: Record<OptionState, { border: string; background: string; icon: ColorName }> = {
    idle: { border: colors.border, background: colors.surface, icon: 'textSecondary' },
    selected: { border: colors.accent, background: colors.accentSoft, icon: 'accent' },
    right: { border: colors.success, background: colors.successSoft, icon: 'success' },
    wrong: { border: colors.danger, background: colors.dangerSoft, icon: 'danger' },
    missed: { border: colors.success, background: colors.surface, icon: 'success' },
  };
  const icon: IconName =
    state === 'right' || state === 'missed'
      ? 'check'
      : state === 'wrong'
        ? 'close'
        : kind === 'radio'
          ? selected
            ? 'radioOn'
            : 'circle'
          : selected
            ? 'checkboxOn'
            : 'checkboxOff';
  const status =
    state === 'right' ? t('study.optionRight') : state === 'wrong' ? t('study.optionWrong') : state === 'missed' ? t('study.optionMissed') : '';

  return (
    <Pressable
      accessibilityRole={kind}
      aria-checked={selected}
      aria-disabled={disabled}
      accessibilityLabel={status ? `${label}. ${status}` : label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        { borderColor: look[state].border, backgroundColor: look[state].background },
        pressed && styles.pressed,
      ]}>
      <Icon name={icon} color={look[state].icon} />
      <AppText style={styles.optionText}>
        <InlineMarkdown source={label} />
      </AppText>
    </Pressable>
  );
}

/** How an option looks once the right answer may be shown. */
function revealedState(selected: boolean, correct: boolean): OptionState {
  if (selected) return correct ? 'right' : 'wrong';
  return correct ? 'missed' : 'idle';
}

function SingleChoice({ question, answer, onChange, locked, revealed }: ViewProps<'single_choice'>) {
  return (
    <View accessibilityRole="radiogroup" style={styles.stack}>
      {question.options.map((option, index) => {
        const selected = answer.choice === index;
        return (
          <OptionRow
            key={index}
            kind="radio"
            label={option}
            selected={selected}
            disabled={locked}
            state={revealed ? revealedState(selected, question.answer === index) : selected ? 'selected' : 'idle'}
            onPress={() => onChange({ type: 'single_choice', choice: index })}
          />
        );
      })}
    </View>
  );
}

function MultipleChoice({ question, answer, onChange, locked, revealed }: ViewProps<'multiple_choice'>) {
  const { t } = useTranslation();
  const toggle = (index: number) => {
    const choices = answer.choices.includes(index)
      ? answer.choices.filter((choice) => choice !== index)
      : [...answer.choices, index].sort((a, b) => a - b);
    onChange({ type: 'multiple_choice', choices });
  };
  return (
    <View style={styles.stack}>
      <AppText variant="small" color="textSecondary">
        {t('study.selectAll')}
      </AppText>
      {question.options.map((option, index) => {
        const selected = answer.choices.includes(index);
        return (
          <OptionRow
            key={index}
            kind="checkbox"
            label={option}
            selected={selected}
            disabled={locked}
            state={revealed ? revealedState(selected, question.answers.includes(index)) : selected ? 'selected' : 'idle'}
            onPress={() => toggle(index)}
          />
        );
      })}
    </View>
  );
}

function TrueFalse({ question, answer, onChange, locked, revealed }: ViewProps<'true_false'>) {
  const { t } = useTranslation();
  return (
    <View accessibilityRole="radiogroup" style={styles.stack}>
      {[true, false].map((value) => {
        const selected = answer.value === value;
        return (
          <OptionRow
            key={String(value)}
            kind="radio"
            label={value ? t('study.true') : t('study.false')}
            selected={selected}
            disabled={locked}
            state={revealed ? revealedState(selected, question.answer === value) : selected ? 'selected' : 'idle'}
            onPress={() => onChange({ type: 'true_false', value })}
          />
        );
      })}
    </View>
  );
}

function ShortAnswer({ question, answer, onChange, locked, revealed }: ViewProps<'short_answer'>) {
  const { t } = useTranslation();
  const right = matchesAccepted(question.accepted, answer.text);
  return (
    <View style={styles.stack}>
      <TextField
        value={answer.text}
        onChangeText={(text) => onChange({ type: 'short_answer', text })}
        editable={!locked}
        placeholder={t('study.yourAnswer')}
        accessibilityLabel={t('study.yourAnswer')}
        autoCapitalize="none"
        autoCorrect={false}
        trailing={revealed ? <Icon name={right ? 'check' : 'close'} color={right ? 'success' : 'danger'} /> : null}
      />
      {revealed && !right ? <AppText color="success">{t('study.correctAnswer', { answer: question.accepted[0] })}</AppText> : null}
    </View>
  );
}

function Cloze({ question, answer, onChange, locked, revealed }: ViewProps<'cloze'>) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const segments = clozeSegments(question.text);
  const gapById = new Map(question.gaps.map((gap) => [gap.id, gap]));
  const setGap = (gapId: string, text: string) => onChange({ type: 'cloze', gaps: { ...answer.gaps, [gapId]: text } });

  return (
    <View style={styles.stack}>
      <AppText style={styles.clozeText}>
        {segments.map((segment, index) => {
          if (segment.kind === 'text') return segment.text;
          const value = (answer.gaps[segment.gapId] ?? '').trim();
          const gap = gapById.get(segment.gapId);
          const right = gap ? matchesAccepted(gap.accepted, value) : false;
          const color = revealed ? (right ? colors.success : colors.danger) : colors.accent;
          return (
            <AppText key={index} variant="bodyStrong" style={[styles.gapInline, { color }]}>
              {`(${segment.number}) ${value || '_____'}`}
            </AppText>
          );
        })}
      </AppText>

      {segments.map((segment) => {
        if (segment.kind !== 'gap') return null;
        const gap = gapById.get(segment.gapId);
        if (!gap) return null;
        const value = answer.gaps[gap.id] ?? '';
        const right = matchesAccepted(gap.accepted, value);
        const label = t('study.gap', { number: segment.number });
        return (
          <View key={gap.id} style={styles.gap}>
            <AppText variant="label" color="textSecondary">
              {label}
            </AppText>
            {gap.options ? (
              <View style={styles.chips}>
                {gap.options.map((option) => (
                  <Chip
                    key={option}
                    label={option}
                    selected={value === option}
                    onPress={() => {
                      if (!locked) setGap(gap.id, option);
                    }}
                  />
                ))}
              </View>
            ) : (
              <TextField
                value={value}
                onChangeText={(text) => setGap(gap.id, text)}
                editable={!locked}
                placeholder={t('study.yourAnswer')}
                accessibilityLabel={label}
                autoCapitalize="none"
                autoCorrect={false}
                trailing={revealed ? <Icon name={right ? 'check' : 'close'} color={right ? 'success' : 'danger'} /> : null}
              />
            )}
            {revealed && !right ? (
              <AppText variant="small" color="success">
                {t('study.correctAnswer', { answer: gap.accepted[0] })}
              </AppText>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const ESSAY_LABEL = { 0: 'missed', 0.5: 'partly', 1: 'got' } as const;

function Essay({ question, answer, onChange, locked }: ViewProps<'essay'>) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const words = countWords(answer.text);

  return (
    <View style={styles.stack}>
      <TextField
        value={answer.text}
        onChangeText={(text) => onChange({ ...answer, text })}
        editable={!locked && !answer.submitted}
        multiline
        textAlignVertical="top"
        placeholder={t('study.essay.placeholder')}
        accessibilityLabel={t('study.essay.placeholder')}
        style={styles.essayInput}
      />
      <AppText variant="small" color="textSecondary">
        {t('study.essay.words', { count: words })}
        {question.minWords ? ` · ${t('study.essay.minWords', { count: question.minWords })}` : ''}
      </AppText>

      {answer.submitted ? (
        <>
          <View style={[styles.panel, { backgroundColor: colors.surfaceAlt }]}>
            <AppText variant="label" color="textSecondary">
              {t('study.essay.modelAnswer')}
            </AppText>
            <Markdown source={question.modelAnswer} />
            {question.rubric ? (
              <>
                <AppText variant="label" color="textSecondary">
                  {t('study.essay.rubric')}
                </AppText>
                <Markdown source={question.rubric} color="textSecondary" />
              </>
            ) : null}
          </View>
          <AppText variant="bodyStrong">{t('study.essay.rate')}</AppText>
          <View style={styles.chips}>
            {ESSAY_RATINGS.map((rating) => (
              <Chip
                key={rating}
                label={t(`study.essay.rating.${ESSAY_LABEL[rating]}`)}
                selected={answer.rating === rating}
                onPress={() => {
                  if (!locked) onChange({ ...answer, rating });
                }}
              />
            ))}
          </View>
        </>
      ) : (
        <View style={styles.start}>
          <Button
            kind="secondary"
            label={t('study.essay.compare')}
            disabled={locked || words === 0}
            onPress={() => onChange({ ...answer, submitted: true })}
          />
        </View>
      )}
    </View>
  );
}

function Flashcard({ question, answer, onChange, locked }: ViewProps<'flashcard'>) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  if (!answer.revealed) {
    return (
      <View style={styles.start}>
        <Button
          kind="secondary"
          label={t('study.flashcard.show')}
          disabled={locked}
          onPress={() => onChange({ ...answer, revealed: true })}
        />
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      <View style={[styles.panel, { backgroundColor: colors.accentSoft }]}>
        <Markdown source={question.back} />
      </View>
      <AppText variant="bodyStrong">{t('study.flashcard.rate')}</AppText>
      <View style={styles.chips}>
        {FLASHCARD_RATINGS.map((rating) => (
          <Chip
            key={rating}
            label={t(`study.flashcard.rating.${rating}`)}
            selected={answer.rating === rating}
            onPress={() => {
              if (!locked) onChange({ ...answer, rating });
            }}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  option: {
    minHeight: MIN_TOUCH + 8,
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  optionText: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.6 },
  clozeText: { fontSize: 18, lineHeight: 30 },
  gapInline: { fontSize: 18, lineHeight: 30, textDecorationLine: 'underline' },
  gap: { gap: spacing.xs, marginTop: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  essayInput: { minHeight: 140, paddingTop: spacing.md },
  panel: { borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  start: { alignItems: 'flex-start' },
});
