import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { LibraryDocument } from '@/core/schema';
import { groupFile } from '@/core/transfer/files';
import type { GroupSummary } from '@/data/groups-repository';
import { useData, useQuery } from '@/data/provider';
import { openGroup } from '@/features/library/open-item';
import { shareTextFile } from '@/platform/files';
import { Button } from '@/ui/controls';
import { Icon } from '@/ui/icon';
import { EmptyState, Page } from '@/ui/layout';
import { type SheetAction, ActionSheet, ConfirmDialog, PromptDialog } from '@/ui/overlays';
import { AppText } from '@/ui/text';
import { MIN_TOUCH, radius, spacing, useTheme } from '@/ui/theme';

/** Create, rename, export and delete groups. Items are moved into groups from their own menu. */
export default function GroupsScreen() {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { groups, library } = useData();
  const list = useQuery('groups:list', ({ groups: all }) => all.list());
  const [target, setTarget] = useState<GroupSummary | null>(null);
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<GroupSummary | null>(null);
  const [removing, setRemoving] = useState<GroupSummary | null>(null);
  const [message, setMessage] = useState<{ tone: 'danger' | 'accent'; text: string } | null>(null);

  const fail = () => setMessage({ tone: 'danger', text: t('errors.generic') });
  const run = (work: Promise<unknown>) => {
    setMessage(null);
    work.catch(fail);
  };

  const exportGroup = async (group: GroupSummary) => {
    const items = await library.list({ groupId: group.id });
    const documents: LibraryDocument[] = [];
    for (const item of items) {
      const document = await library.getDocument(item.id);
      if (document) documents.push(document);
    }
    if (documents.length === 0) {
      setMessage({ tone: 'danger', text: t('groups.exportEmpty') });
      return;
    }
    const file = groupFile(group.name, documents);
    const result = await shareTextFile(file);
    if (result === 'unavailable') fail();
    else if (result === 'downloaded') setMessage({ tone: 'accent', text: t('actions.exported', { name: file.name }) });
  };

  const actions: SheetAction[] = target
    ? [
        { key: 'show', icon: 'folder', label: t('groups.show'), onPress: () => openGroup(target.id) },
        { key: 'rename', icon: 'edit', label: t('groups.rename'), onPress: () => setRenaming(target) },
        { key: 'export', icon: 'share', label: t('groups.export'), onPress: () => run(exportGroup(target)) },
        { key: 'remove', icon: 'trash', label: t('groups.remove'), danger: true, onPress: () => setRemoving(target) },
      ]
    : [];

  const data = list.data ?? [];

  return (
    <Page>
      <Stack.Screen options={{ title: t('groups.title') }} />
      <FlatList
        data={data}
        keyExtractor={(group) => group.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.start}>
              <Button icon="add" label={t('groups.new')} onPress={() => setCreating(true)} />
            </View>
            {message ? (
              <AppText color={message.tone} accessibilityLiveRegion="polite">
                {message.text}
              </AppText>
            ) : null}
          </View>
        }
        renderItem={({ item: group }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('groups.actions', { name: group.name })}
            onPress={() => setTarget(group)}
            style={({ pressed }) => [styles.row, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}>
            <Icon name="folder" color="accent" />
            <View style={styles.rowText}>
              <AppText variant="bodyStrong" numberOfLines={2}>
                {group.name}
              </AppText>
              <AppText variant="small" color="textSecondary">
                {t('groups.items', { count: group.itemCount })}
              </AppText>
            </View>
            <Icon name="more" color="textSecondary" />
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={list.loading ? undefined : <EmptyState icon="folder" title={t('groups.empty.title')} body={t('groups.empty.body')} />}
      />

      <ActionSheet visible={target !== null} title={target ? t('groups.actions', { name: target.name }) : ''} actions={actions} onClose={() => setTarget(null)} />
      <PromptDialog
        visible={creating}
        title={t('groups.new')}
        placeholder={t('groups.namePlaceholder')}
        confirmLabel={t('common.create')}
        cancelLabel={t('common.cancel')}
        onSubmit={(name) => run(groups.ensure(name))}
        onClose={() => setCreating(false)}
      />
      <PromptDialog
        visible={renaming !== null}
        title={t('groups.rename')}
        initialValue={renaming?.name}
        placeholder={t('groups.namePlaceholder')}
        confirmLabel={t('common.save')}
        cancelLabel={t('common.cancel')}
        onSubmit={(name) => {
          if (renaming) run(groups.rename(renaming.id, name));
        }}
        onClose={() => setRenaming(null)}
      />
      <ConfirmDialog
        visible={removing !== null}
        danger
        title={removing ? t('groups.removeTitle', { name: removing.name }) : ''}
        body={t('groups.removeBody')}
        confirmLabel={t('groups.remove')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => {
          if (removing) run(groups.remove(removing.id));
        }}
        onClose={() => setRemoving(null)}
      />
    </Page>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, flexGrow: 1 },
  header: { gap: spacing.md, paddingBottom: spacing.lg },
  start: { alignItems: 'flex-start' },
  row: {
    minHeight: MIN_TOUCH + 16,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  separator: { height: spacing.sm },
  pressed: { opacity: 0.7 },
});
