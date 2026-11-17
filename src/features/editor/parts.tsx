import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type LibraryDocument, type ParseIssue, parseDocument } from '@/core/schema';
import { useData, useQuery } from '@/data/provider';
import { Button, IconButton, TextField } from '@/ui/controls';
import { AppText } from '@/ui/text';
import { monoFont, radius, spacing, useTheme } from '@/ui/theme';

/**
 * Loads a document for editing. `save` validates first and writes only a valid document,
 * returning the problems otherwise. Marks and results survive, because content is replaced by id.
 */
export function useEditor(itemId: string) {
  const data = useData();
  const loaded = useQuery(`edit:${itemId}`, ({ library }) => library.getDocument(itemId));

  const save = async (next: LibraryDocument): Promise<ParseIssue[]> => {
    const parsed = parseDocument(next);
    if (!parsed.ok) return parsed.issues;
    await data.library.replace(parsed.document);
    return [];
  };

  return { document: loaded.data ?? null, loading: loaded.loading, save };
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <AppText variant="label" color="textSecondary">
        {label}
      </AppText>
      {children}
      {hint ? (
        <AppText variant="small" color="textSecondary">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

type SaveBarProps = { onSave: () => void; saved?: boolean; issues?: ParseIssue[]; failed?: boolean; label?: string };

/** The bar at the bottom of an editor screen, with whatever stopped the last save. */
export function SaveBar({ onSave, saved = false, issues = [], failed = false, label }: SaveBarProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  return (
    <View style={[styles.bar, { backgroundColor: colors.background, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
      {issues.length > 0 ? (
        <View accessibilityLiveRegion="polite" style={[styles.issues, { backgroundColor: colors.dangerSoft }]}>
          <AppText variant="bodyStrong">{t('editor.problems')}</AppText>
          {issues.slice(0, 5).map((issue, index) => (
            <AppText key={index} variant="small">
              <AppText variant="small" style={{ fontFamily: monoFont }}>
                {issue.path}
              </AppText>
              {issue.path ? ': ' : ''}
              {issue.message}
            </AppText>
          ))}
        </View>
      ) : null}
      {failed ? <AppText color="danger">{t('errors.generic')}</AppText> : null}
      <View style={styles.barRow}>
        {saved ? (
          <AppText color="accent" accessibilityLiveRegion="polite">
            {t('editor.saved')}
          </AppText>
        ) : (
          <View />
        )}
        <Button icon="check" label={label ?? t('common.save')} onPress={onSave} />
      </View>
    </View>
  );
}

type RowProps = {
  title: string;
  subtitle?: string;
  onOpen?: () => void;
  onUp?: () => void;
  onDown?: () => void;
  onRemove?: () => void;
};

/** One line in a list of lessons, questions or cards, with its move, open and remove buttons. */
export function StructureRow({ title, subtitle, onOpen, onUp, onDown, onRemove }: RowProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('editor.open', { name: title })}
        disabled={!onOpen}
        onPress={onOpen}
        style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]}>
        <AppText variant="bodyStrong" numberOfLines={2}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="small" color="textSecondary" numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </Pressable>
      {onUp ? <IconButton icon="up" label={t('editor.moveUp', { name: title })} onPress={onUp} /> : null}
      {onDown ? <IconButton icon="down" label={t('editor.moveDown', { name: title })} onPress={onDown} /> : null}
      {onRemove ? <IconButton icon="trash" label={t('editor.remove', { name: title })} onPress={onRemove} /> : null}
    </View>
  );
}

type RowsProps = {
  rows: string[];
  placeholder: (number: number) => string;
  addLabel: string;
  onEdit: (index: number, text: string) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onMove?: (index: number, delta: number) => void;
  /** A control shown before each row, such as the "this one is correct" toggle. */
  leading?: (index: number) => ReactNode;
  min?: number;
  max?: number;
};

/** An editable list of short texts: options, accepted answers, items to order, group names. */
export function TextRows({ rows, placeholder, addLabel, onEdit, onAdd, onRemove, onMove, leading, min = 1, max = 10 }: RowsProps) {
  const { t } = useTranslation();
  return (
    <View style={styles.rows}>
      {rows.map((row, index) => (
        <View key={index} style={styles.textRow}>
          {leading?.(index)}
          <View style={styles.textRowField}>
            <TextField
              value={row}
              onChangeText={(text) => onEdit(index, text)}
              placeholder={placeholder(index + 1)}
              accessibilityLabel={placeholder(index + 1)}
            />
          </View>
          {onMove ? (
            <>
              <IconButton icon="up" label={t('editor.moveUp', { name: placeholder(index + 1) })} onPress={() => onMove(index, -1)} />
              <IconButton icon="down" label={t('editor.moveDown', { name: placeholder(index + 1) })} onPress={() => onMove(index, 1)} />
            </>
          ) : null}
          {rows.length > min ? (
            <IconButton icon="close" label={t('editor.remove', { name: placeholder(index + 1) })} onPress={() => onRemove(index)} />
          ) : null}
        </View>
      ))}
      {rows.length < max ? (
        <View style={styles.start}>
          <Button kind="plain" icon="add" label={addLabel} onPress={onAdd} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.sm },
  bar: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
  barRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  issues: { borderRadius: radius.md, padding: spacing.md, gap: spacing.xs },
  row: { borderWidth: 1, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', paddingRight: spacing.xs },
  rowMain: { flex: 1, minWidth: 0, padding: spacing.md, gap: 2 },
  pressed: { opacity: 0.6 },
  rows: { gap: spacing.sm },
  textRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  textRowField: { flex: 1, minWidth: 0 },
  start: { alignItems: 'flex-start' },
});
