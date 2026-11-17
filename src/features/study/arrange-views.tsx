import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import type { AnswerOf } from '@/core/quiz/answers';
import { stableShuffle } from '@/core/quiz/shuffle';
import type { Question } from '@/core/schema';
import { IconButton, pressedState } from '@/ui/controls';
import { DragArea, Draggable, DropZone } from '@/ui/drag';
import { Icon } from '@/ui/icon';
import { AppText } from '@/ui/text';
import { MIN_TOUCH, radius, spacing, useTheme } from '@/ui/theme';

type ViewProps<T extends 'matching' | 'ordering' | 'categorize'> = {
  question: Extract<Question, { type: T }>;
  answer: AnswerOf<T>;
  onChange: (answer: AnswerOf<T>) => void;
  locked: boolean;
  revealed: boolean;
};

type ChipProps = { label: string; selected?: boolean; tone?: 'idle' | 'right' | 'wrong' };

/** A movable piece of text. Looks the same in the pool and once placed. */
function Piece({ label, selected = false, tone = 'idle' }: ChipProps) {
  const { colors } = useTheme();
  const look = {
    idle: { border: selected ? colors.accent : colors.border, background: selected ? colors.accentSoft : colors.surface },
    right: { border: colors.success, background: colors.successSoft },
    wrong: { border: colors.danger, background: colors.dangerSoft },
  }[tone];
  return (
    <View style={[styles.piece, { borderColor: look.border, backgroundColor: look.background }]}>
      <AppText>{label}</AppText>
    </View>
  );
}

/** Each left item is a drop target. Right items are dragged onto them, or tapped and then placed with a tap. */
export function Matching({ question, answer, onChange, locked, revealed }: ViewProps<'matching'>) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [picked, setPicked] = useState<number | null>(null);
  const pool = stableShuffle(question.pairs.length, question.id).filter((right) => !answer.matches.includes(right));

  const place = (left: number, right: number) => {
    if (locked) return;
    // A right item can sit with one left item only, so it leaves wherever it was.
    const matches = question.pairs.map((_, index) => (answer.matches[index] === right ? null : (answer.matches[index] ?? null)));
    matches[left] = right;
    setPicked(null);
    onChange({ type: 'matching', matches });
  };
  const clear = (left: number) => {
    if (locked) return;
    const matches = question.pairs.map((_, index) => (index === left ? null : (answer.matches[index] ?? null)));
    onChange({ type: 'matching', matches });
  };

  return (
    <DragArea>
      <View style={styles.stack}>
        <AppText variant="small" color="textSecondary">
          {t('study.matching.hint')}
        </AppText>
        {question.pairs.map((pair, left) => {
          const chosen = answer.matches[left] ?? null;
          const right = chosen !== null && question.pairs[chosen]?.right === pair.right;
          const border = revealed ? (right ? colors.success : colors.danger) : colors.border;
          return (
            <DropZone key={left} id={String(left)}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('study.matching.slot', { left: pair.left, right: chosen === null ? t('study.matching.empty') : question.pairs[chosen].right })}
                disabled={locked}
                onPress={() => (picked !== null ? place(left, picked) : chosen !== null ? clear(left) : undefined)}
                style={[styles.slot, { borderColor: border, backgroundColor: colors.surface }]}>
                <AppText variant="bodyStrong" style={styles.slotLeft}>
                  {pair.left}
                </AppText>
                <View style={styles.slotRight}>
                  {chosen === null ? (
                    <AppText color="textSecondary">{t('study.matching.empty')}</AppText>
                  ) : (
                    <Piece label={question.pairs[chosen].right} tone={revealed ? (right ? 'right' : 'wrong') : 'idle'} />
                  )}
                  {revealed && !right ? (
                    <AppText variant="small" color="success">
                      {t('study.correctAnswer', { answer: pair.right })}
                    </AppText>
                  ) : null}
                </View>
              </Pressable>
            </DropZone>
          );
        })}

        {pool.length > 0 ? (
          <View style={styles.pool}>
            {pool.map((right) => (
              <Draggable
                key={right}
                disabled={locked}
                onDrop={(zone) => place(Number(zone), right)}
                onTap={() => setPicked(picked === right ? null : right)}>
                <View accessibilityRole="button" accessibilityLabel={question.pairs[right].right} {...pressedState(picked === right)}>
                  <Piece label={question.pairs[right].right} selected={picked === right} />
                </View>
              </Draggable>
            ))}
          </View>
        ) : null}
      </View>
    </DragArea>
  );
}

/** A list to rearrange by dragging a row onto another position, or with the arrow buttons. */
export function Ordering({ question, answer, onChange, locked, revealed }: ViewProps<'ordering'>) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const order = answer.order ?? stableShuffle(question.items.length, question.id);

  const move = (from: number, to: number) => {
    if (locked || to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange({ type: 'ordering', order: next });
  };

  return (
    <DragArea>
      <View style={styles.stack}>
        <AppText variant="small" color="textSecondary">
          {t('study.ordering.hint')}
        </AppText>
        {order.map((item, position) => {
          const right = question.items[item] === question.items[position];
          const border = revealed ? (right ? colors.success : colors.danger) : colors.border;
          const background = revealed ? (right ? colors.successSoft : colors.dangerSoft) : colors.surface;
          const label = question.items[item];
          return (
            <DropZone key={item} id={String(position)}>
              <View style={[styles.orderRow, { borderColor: border, backgroundColor: background }]}>
                <Draggable disabled={locked} onDrop={(zone) => move(position, Number(zone))} style={styles.orderMain}>
                  <View style={styles.orderHandle}>
                    <Icon name="drag" color="textSecondary" />
                    <AppText style={styles.orderText}>
                      {position + 1}. {label}
                    </AppText>
                  </View>
                </Draggable>
                {locked ? null : (
                  <>
                    <IconButton icon="up" label={t('study.ordering.up', { item: label })} onPress={() => move(position, position - 1)} />
                    <IconButton icon="down" label={t('study.ordering.down', { item: label })} onPress={() => move(position, position + 1)} />
                  </>
                )}
              </View>
            </DropZone>
          );
        })}
        {revealed && order.some((item, position) => question.items[item] !== question.items[position]) ? (
          <View style={[styles.solution, { backgroundColor: colors.successSoft }]}>
            <AppText variant="label" color="success">
              {t('study.ordering.correct')}
            </AppText>
            {question.items.map((item, index) => (
              <AppText key={index}>
                {index + 1}. {item}
              </AppText>
            ))}
          </View>
        ) : null}
      </View>
    </DragArea>
  );
}

/** Items start in a pool and are dragged into groups, or tapped and then placed by tapping a group. */
export function Categorize({ question, answer, onChange, locked, revealed }: ViewProps<'categorize'>) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [picked, setPicked] = useState<number | null>(null);
  const placements = question.items.map((_, index) => answer.placements[index] ?? null);
  const pool = stableShuffle(question.items.length, question.id).filter((item) => placements[item] === null);

  const place = (item: number, category: number | null) => {
    if (locked) return;
    setPicked(null);
    onChange({ type: 'categorize', placements: placements.map((current, index) => (index === item ? category : current)) });
  };

  const piece = (item: number, placed: boolean) => {
    const right = placements[item] === question.items[item].category;
    return (
      <Draggable
        key={item}
        disabled={locked}
        onDrop={(zone) => place(item, zone === 'pool' ? null : Number(zone))}
        onTap={() => setPicked(picked === item ? null : item)}>
        <View accessibilityRole="button" accessibilityLabel={question.items[item].text} {...pressedState(picked === item)}>
          <Piece label={question.items[item].text} selected={picked === item} tone={revealed && placed ? (right ? 'right' : 'wrong') : 'idle'} />
          {revealed && placed && !right ? (
            <AppText variant="small" color="success">
              {t('study.categorize.belongs', { group: question.categories[question.items[item].category] })}
            </AppText>
          ) : null}
        </View>
      </Draggable>
    );
  };

  return (
    <DragArea>
      <View style={styles.stack}>
        <AppText variant="small" color="textSecondary">
          {t('study.categorize.hint')}
        </AppText>

        {/* Group names are the tap targets. The pieces sit beside them, not inside, so no button nests in another. */}
        <DropZone id="pool" style={[styles.poolBox, { borderColor: colors.border }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('study.categorize.pool')}
            disabled={locked || picked === null}
            onPress={() => (picked !== null ? place(picked, null) : undefined)}>
            <AppText variant="label" color="textSecondary">
              {pool.length === 0 ? t('study.categorize.allPlaced') : t('study.categorize.pool')}
            </AppText>
          </Pressable>
          <View style={styles.pool}>{pool.map((item) => piece(item, false))}</View>
        </DropZone>

        {question.categories.map((category, index) => (
          <DropZone
            key={index}
            id={String(index)}
            style={[styles.bucket, { borderColor: picked !== null ? colors.accent : colors.border, backgroundColor: colors.surface }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('study.categorize.group', { group: category })}
              disabled={locked || picked === null}
              onPress={() => (picked !== null ? place(picked, index) : undefined)}
              style={styles.bucketHead}>
              <AppText variant="bodyStrong">{category}</AppText>
              {picked !== null ? (
                <AppText variant="small" color="accent">
                  {t('study.categorize.placeHere')}
                </AppText>
              ) : null}
            </Pressable>
            <View style={styles.pool}>{placements.map((placed, item) => (placed === index ? piece(item, true) : null))}</View>
          </DropZone>
        ))}
      </View>
    </DragArea>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.sm },
  piece: { borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: MIN_TOUCH - 4, justifyContent: 'center' },
  pool: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  poolBox: { borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, minHeight: MIN_TOUCH + spacing.xl },
  slot: { borderWidth: 1.5, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, minHeight: MIN_TOUCH + 8 },
  slotLeft: { flexShrink: 1 },
  slotRight: { alignItems: 'flex-start', gap: spacing.xs },
  orderRow: { borderWidth: 1.5, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', minHeight: MIN_TOUCH + 8, paddingLeft: spacing.sm },
  orderMain: { flex: 1, minWidth: 0 },
  orderHandle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  orderText: { flex: 1, minWidth: 0 },
  solution: { borderRadius: radius.md, padding: spacing.md, gap: 2 },
  bucket: { borderWidth: 1.5, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm, minHeight: MIN_TOUCH + spacing.xxl },
  bucketHead: { minHeight: MIN_TOUCH - 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
});
