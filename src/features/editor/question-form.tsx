import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { type QuestionDraft, clozeGapIds } from '@/core/edit/drafts';
import { Button, Chip, IconButton, Stepper, TextField } from '@/ui/controls';
import { AppText } from '@/ui/text';
import { spacing } from '@/ui/theme';

import { Field, TextRows } from './parts';

type Props = { draft: QuestionDraft; onChange: (draft: QuestionDraft) => void };

const without = <T,>(items: T[], index: number) => items.filter((_, position) => position !== index);
const replaced = <T,>(items: T[], index: number, value: T) => items.map((item, position) => (position === index ? value : item));
const moved = <T,>(items: T[], index: number, delta: number) => {
  const target = index + delta;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
};

/** The fields for one question. Which ones appear depends on the question's type. */
export function QuestionForm({ draft, onChange }: Props) {
  const { t } = useTranslation();
  const set = (changes: Partial<QuestionDraft>) => onChange({ ...draft, ...changes });
  const isCard = draft.type === 'flashcard';

  const removeOption = (index: number) =>
    set({
      options: without(draft.options, index),
      // Positions after the removed row move up by one.
      correct: draft.correct.filter((entry) => entry !== index).map((entry) => (entry > index ? entry - 1 : entry)),
    });

  const removeGroup = (index: number) =>
    set({
      categories: without(draft.categories, index),
      sortItems: draft.sortItems.map((item) => ({ ...item, category: item.category === index ? 0 : item.category > index ? item.category - 1 : item.category })),
    });

  return (
    <View style={styles.form}>
      <Field label={isCard ? t('editor.question.front') : draft.type === 'true_false' ? t('editor.question.statement') : t('editor.question.prompt')}>
        <TextField
          value={draft.prompt}
          onChangeText={(prompt) => set({ prompt })}
          accessibilityLabel={isCard ? t('editor.question.front') : t('editor.question.prompt')}
          multiline
          style={styles.medium}
        />
      </Field>

      {draft.type === 'single_choice' || draft.type === 'multiple_choice' ? (
        <Field label={t('editor.question.options')} hint={draft.type === 'single_choice' ? t('editor.question.correctOne') : t('editor.question.correctMany')}>
          <TextRows
            rows={draft.options}
            min={2}
            max={8}
            placeholder={(number) => t('editor.question.optionPlaceholder', { number })}
            addLabel={t('editor.question.addOption')}
            onEdit={(index, text) => set({ options: replaced(draft.options, index, text) })}
            onAdd={() => set({ options: [...draft.options, ''] })}
            onRemove={removeOption}
            leading={(index) => {
              const on = draft.correct.includes(index);
              const single = draft.type === 'single_choice';
              return (
                <IconButton
                  icon={single ? (on ? 'radioOn' : 'circle') : on ? 'checkboxOn' : 'checkboxOff'}
                  color={on ? 'accent' : 'textSecondary'}
                  selected={on}
                  label={t('editor.question.markCorrect', { number: index + 1 })}
                  onPress={() => set({ correct: single ? [index] : on ? draft.correct.filter((entry) => entry !== index) : [...draft.correct, index] })}
                />
              );
            }}
          />
        </Field>
      ) : null}

      {draft.type === 'true_false' ? (
        <Field label={t('editor.question.answerIs')}>
          <View style={styles.chips}>
            <Chip label={t('study.true')} selected={draft.truth} onPress={() => set({ truth: true })} />
            <Chip label={t('study.false')} selected={!draft.truth} onPress={() => set({ truth: false })} />
          </View>
        </Field>
      ) : null}

      {draft.type === 'short_answer' ? (
        <Field label={t('editor.question.accepted')} hint={t('editor.question.acceptedHint')}>
          <TextRows
            rows={draft.accepted}
            placeholder={(number) => t('editor.question.acceptedPlaceholder', { number })}
            addLabel={t('editor.question.addAccepted')}
            onEdit={(index, text) => set({ accepted: replaced(draft.accepted, index, text) })}
            onAdd={() => set({ accepted: [...draft.accepted, ''] })}
            onRemove={(index) => set({ accepted: without(draft.accepted, index) })}
          />
        </Field>
      ) : null}

      {draft.type === 'cloze' ? (
        <>
          <Field label={t('editor.question.clozeText')} hint={t('editor.question.clozeHint', { first: '{{1}}', second: '{{2}}' })}>
            <TextField
              value={draft.text}
              onChangeText={(text) => set({ text })}
              accessibilityLabel={t('editor.question.clozeText')}
              multiline
              autoCapitalize="none"
              style={styles.medium}
            />
          </Field>
          {clozeGapIds(draft).length === 0 ? <AppText color="textSecondary">{t('editor.question.noGaps')}</AppText> : null}
          {clozeGapIds(draft).map((gapId) => {
            const gap = draft.gaps[gapId] ?? { accepted: '', options: '' };
            const setGap = (changes: Partial<typeof gap>) => set({ gaps: { ...draft.gaps, [gapId]: { ...gap, ...changes } } });
            return (
              <Field key={gapId} label={t('editor.question.gap', { id: gapId })}>
                <TextField
                  value={gap.accepted}
                  onChangeText={(accepted) => setGap({ accepted })}
                  placeholder={t('editor.question.gapAccepted')}
                  accessibilityLabel={`${t('editor.question.gap', { id: gapId })}: ${t('editor.question.gapAccepted')}`}
                  autoCapitalize="none"
                />
                <TextField
                  value={gap.options}
                  onChangeText={(options) => setGap({ options })}
                  placeholder={t('editor.question.gapOptions')}
                  accessibilityLabel={`${t('editor.question.gap', { id: gapId })}: ${t('editor.question.gapOptions')}`}
                  autoCapitalize="none"
                />
              </Field>
            );
          })}
        </>
      ) : null}

      {draft.type === 'essay' ? (
        <>
          <Field label={t('editor.question.modelAnswer')}>
            <TextField value={draft.modelAnswer} onChangeText={(modelAnswer) => set({ modelAnswer })} accessibilityLabel={t('editor.question.modelAnswer')} multiline style={styles.large} />
          </Field>
          <Field label={t('editor.question.rubric')}>
            <TextField value={draft.rubric} onChangeText={(rubric) => set({ rubric })} accessibilityLabel={t('editor.question.rubric')} multiline style={styles.medium} />
          </Field>
          <Field label={t('editor.question.minWords')}>
            <TextField value={draft.minWords} onChangeText={(minWords) => set({ minWords })} accessibilityLabel={t('editor.question.minWords')} keyboardType="number-pad" maxLength={4} />
          </Field>
        </>
      ) : null}

      {isCard ? (
        <Field label={t('editor.question.back')}>
          <TextField value={draft.back} onChangeText={(back) => set({ back })} accessibilityLabel={t('editor.question.back')} multiline style={styles.medium} />
        </Field>
      ) : null}

      {draft.type === 'matching' ? (
        <Field label={t('editor.question.pairs')}>
          {draft.pairs.map((pair, index) => (
            <View key={index} style={styles.pair}>
              <View style={styles.pairFields}>
                <TextField
                  value={pair.left}
                  onChangeText={(left) => set({ pairs: replaced(draft.pairs, index, { ...pair, left }) })}
                  placeholder={t('editor.question.left', { number: index + 1 })}
                  accessibilityLabel={t('editor.question.left', { number: index + 1 })}
                />
                <TextField
                  value={pair.right}
                  onChangeText={(right) => set({ pairs: replaced(draft.pairs, index, { ...pair, right }) })}
                  placeholder={t('editor.question.right', { number: index + 1 })}
                  accessibilityLabel={t('editor.question.right', { number: index + 1 })}
                />
              </View>
              {draft.pairs.length > 2 ? (
                <IconButton icon="close" label={t('editor.remove', { name: t('editor.question.left', { number: index + 1 }) })} onPress={() => set({ pairs: without(draft.pairs, index) })} />
              ) : null}
            </View>
          ))}
          {draft.pairs.length < 10 ? (
            <View style={styles.start}>
              <Button kind="plain" icon="add" label={t('editor.question.addPair')} onPress={() => set({ pairs: [...draft.pairs, { left: '', right: '' }] })} />
            </View>
          ) : null}
        </Field>
      ) : null}

      {draft.type === 'ordering' ? (
        <Field label={t('editor.question.orderItems')}>
          <TextRows
            rows={draft.items}
            min={2}
            placeholder={(number) => t('editor.question.itemPlaceholder', { number })}
            addLabel={t('editor.question.addItem')}
            onEdit={(index, text) => set({ items: replaced(draft.items, index, text) })}
            onAdd={() => set({ items: [...draft.items, ''] })}
            onRemove={(index) => set({ items: without(draft.items, index) })}
            onMove={(index, delta) => set({ items: moved(draft.items, index, delta) })}
          />
        </Field>
      ) : null}

      {draft.type === 'categorize' ? (
        <>
          <Field label={t('editor.question.groups')}>
            <TextRows
              rows={draft.categories}
              min={2}
              max={6}
              placeholder={(number) => t('editor.question.groupPlaceholder', { number })}
              addLabel={t('editor.question.addGroup')}
              onEdit={(index, text) => set({ categories: replaced(draft.categories, index, text) })}
              onAdd={() => set({ categories: [...draft.categories, ''] })}
              onRemove={removeGroup}
            />
          </Field>
          <Field label={t('editor.question.sortItems')}>
            {draft.sortItems.map((item, index) => (
              <View key={index} style={styles.sortItem}>
                <View style={styles.pair}>
                  <View style={styles.pairFields}>
                    <TextField
                      value={item.text}
                      onChangeText={(text) => set({ sortItems: replaced(draft.sortItems, index, { ...item, text }) })}
                      placeholder={t('editor.question.itemPlaceholder', { number: index + 1 })}
                      accessibilityLabel={t('editor.question.itemPlaceholder', { number: index + 1 })}
                    />
                  </View>
                  {draft.sortItems.length > 2 ? (
                    <IconButton
                      icon="close"
                      label={t('editor.remove', { name: t('editor.question.itemPlaceholder', { number: index + 1 }) })}
                      onPress={() => set({ sortItems: without(draft.sortItems, index) })}
                    />
                  ) : null}
                </View>
                <View style={styles.chips}>
                  {draft.categories.map((category, group) => (
                    <Chip
                      key={group}
                      label={category.trim() || t('editor.question.groupPlaceholder', { number: group + 1 })}
                      selected={item.category === group}
                      onPress={() => set({ sortItems: replaced(draft.sortItems, index, { ...item, category: group }) })}
                    />
                  ))}
                </View>
              </View>
            ))}
            {draft.sortItems.length < 20 ? (
              <View style={styles.start}>
                <Button kind="plain" icon="add" label={t('editor.question.addItem')} onPress={() => set({ sortItems: [...draft.sortItems, { text: '', category: 0 }] })} />
              </View>
            ) : null}
          </Field>
        </>
      ) : null}

      <Field label={t('editor.question.explanation')}>
        <TextField value={draft.explanation} onChangeText={(explanation) => set({ explanation })} accessibilityLabel={t('editor.question.explanation')} multiline style={styles.medium} />
      </Field>

      {isCard ? null : (
        <>
          <Field label={t('editor.question.hint')}>
            <TextField value={draft.hint} onChangeText={(hint) => set({ hint })} accessibilityLabel={t('editor.question.hint')} />
          </Field>
          <Stepper label={t('editor.question.points')} value={draft.points} min={1} max={20} onChange={(points) => set({ points })} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.xl },
  medium: { minHeight: 72, paddingTop: spacing.md },
  large: { minHeight: 120, paddingTop: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pair: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  pairFields: { flex: 1, minWidth: 0, gap: spacing.xs },
  sortItem: { gap: spacing.sm },
  start: { alignItems: 'flex-start' },
});
