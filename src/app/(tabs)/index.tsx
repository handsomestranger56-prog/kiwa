import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useDeferredValue, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { DocumentKind } from '@/core/schema';
import type { LibraryFilter, LibraryItem } from '@/data/library-repository';
import { useQuery } from '@/data/provider';
import { JobsBanner } from '@/features/ai/jobs-banner';
import { useCreateFlow } from '@/features/library/create-flow';
import { useItemActions } from '@/features/library/item-actions';
import { FolderRow, ItemRow } from '@/features/library/item-row';
import { Button, Chip, IconButton, TextField } from '@/ui/controls';
import { Icon } from '@/ui/icon';
import { EmptyState, Loading, Page, StatusBarShade, useTabScreenInsets } from '@/ui/layout';
import { Snackbar } from '@/ui/overlays';
import { AppText } from '@/ui/text';
import { MIN_TOUCH, spacing } from '@/ui/theme';

type FilterKey = 'all' | DocumentKind | 'favorites';
const FILTERS: FilterKey[] = ['all', 'course', 'quiz', 'deck', 'favorites'];

export default function LibraryScreen() {
  const onboarding = useQuery('onboarding', ({ settings }) => settings.get('onboarding.done'));
  if (onboarding.loading) return <Loading />;
  // First launch: say hello before anything else.
  if (onboarding.data === null) return <Redirect href="/welcome" />;
  return <Library />;
}

function Library() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useTabScreenInsets();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  // The group filter lives in the address, so other screens can open the library on one group.
  const params = useLocalSearchParams<{ group?: string }>();
  const groups = useQuery('groups:list', ({ groups }) => groups.list());
  const groupList = groups.data ?? [];
  // The open folder, or none for the top of the library.
  const folder = groupList.find((entry) => entry.id === params.group) ?? null;
  const searching = deferredSearch.trim() !== '';
  const openFolder = (id: string | null) => router.setParams({ group: id ?? undefined });

  // The top of the library shows folders, then items in no folder. A search looks everywhere.
  const query: LibraryFilter = {
    search: deferredSearch,
    kind: filter === 'all' || filter === 'favorites' ? undefined : filter,
    favorite: filter === 'favorites',
    groupId: searching ? undefined : (folder?.id ?? 'none'),
  };
  const items = useQuery(`library:${filter}:${folder?.id ?? 'top'}:${deferredSearch}`, ({ library }) => library.list(query));
  const folderName = (id: string | null) => groupList.find((entry) => entry.id === id)?.name ?? null;
  type Row = { type: 'folder'; id: string; name: string; count: number } | { type: 'item'; item: LibraryItem };
  const rows: Row[] = [
    ...(folder || searching ? [] : groupList.map((entry) => ({ type: 'folder' as const, id: entry.id, name: entry.name, count: entry.itemCount }))),
    ...(items.data ?? []).map((item) => ({ type: 'item' as const, item })),
  ];
  const trash = useQuery('library:trash-count', ({ library }) => library.trashCount());

  const actions = useItemActions();
  const create = useCreateFlow({
    onCreated: (id) => router.push({ pathname: '/item/[id]', params: { id } }),
    onError: actions.showError,
    onCreateWithAi: () => router.push('/create'),
    onImport: () => router.push('/import'),
  });

  // A pending undo message should not follow the user to another screen.
  const open = (id: string) => {
    actions.dismissSnackbar();
    router.push({ pathname: '/item/[id]', params: { id } });
  };
  const openTrash = () => {
    actions.dismissSnackbar();
    router.push('/trash');
  };

  const filtering = filter !== 'all' || folder !== null || searching;
  const trashCount = trash.data ?? 0;

  return (
    <Page>
      <FlatList
        data={rows}
        keyExtractor={(row) => (row.type === 'folder' ? `folder:${row.id}` : row.item.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.list, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.titleRow}>
              {/* Shrinks to fit, so a long title ("Библиотека") never pushes the New button off screen. */}
              <AppText variant="title" accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={styles.titleText}>
                {t('library.title')}
              </AppText>
              <View style={styles.titleButtons}>
                <IconButton icon="folder" label={t('groups.manage')} onPress={() => router.push('/groups')} />
                <Button icon="add" label={t('library.new')} onPress={create.start} />
              </View>
            </View>
            <TextField
              value={search}
              onChangeText={setSearch}
              placeholder={t('library.search')}
              accessibilityLabel={t('library.search')}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              leading={<Icon name="search" size={20} color="textSecondary" />}
              trailing={
                search ? <IconButton icon="close" label={t('common.close')} onPress={() => setSearch('')} /> : null
              }
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
              {FILTERS.map((key) => (
                <Chip
                  key={key}
                  label={t(`library.filter.${key}`)}
                  selected={filter === key}
                  onPress={() => setFilter(key)}
                />
              ))}
            </ScrollView>
            {folder && !searching ? (
              <View style={styles.folderBar}>
                <Button kind="plain" icon="back" label={t('library.title')} onPress={() => openFolder(null)} />
                <View style={styles.folderTitle}>
                  <Icon name="folder" color="warm" />
                  <AppText variant="heading" numberOfLines={1} style={styles.grow}>
                    {folder.name}
                  </AppText>
                </View>
              </View>
            ) : null}
            <JobsBanner />
          </View>
        }
        renderItem={({ item: row }) =>
          row.type === 'folder' ? (
            <FolderRow name={row.name} count={row.count} onOpen={() => openFolder(row.id)} />
          ) : (
            <ItemRow
              item={row.item}
              folder={searching ? folderName(row.item.groupId) : null}
              onOpen={() => open(row.item.id)}
              onToggleFavorite={() => actions.toggleFavorite(row.item)}
              onMore={() => actions.open(row.item)}
            />
          )
        }
        ItemSeparatorComponent={Separator}
        ListEmptyComponent={
          items.loading ? undefined : items.error ? (
            <EmptyState icon="close" title={t('library.loadFailed')} body={items.error.message} />
          ) : filtering ? (
            <EmptyState icon="search" title={t('library.noMatches.title')} body={t('library.noMatches.body')} />
          ) : (
            <EmptyState
              icon="course"
              title={t('library.empty.title')}
              body={t('library.empty.body')}
              action={<Button icon="add" label={t('library.new')} onPress={create.start} />}
            />
          )
        }
        ListFooterComponent={
          trashCount > 0 ? (
            <Pressable
              accessibilityRole="link"
              onPress={openTrash}
              style={({ pressed }) => [styles.trashLink, pressed && styles.pressed]}>
              <Icon name="trash" size={18} color="textSecondary" />
              <AppText variant="small" color="textSecondary">
                {t('library.trash', { count: trashCount })}
              </AppText>
            </Pressable>
          ) : undefined
        }
      />
      {actions.overlays}
      {create.overlays}
      <Snackbar message={actions.snackbar} onDismiss={actions.dismissSnackbar} bottomOffset={insets.bottom} />
      <StatusBarShade />
    </Page>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.lg, flexGrow: 1 },
  header: { gap: spacing.md, paddingBottom: spacing.lg },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  chips: { gap: spacing.sm, paddingRight: spacing.lg },
  folderBar: { gap: spacing.xs, alignItems: 'flex-start' },
  folderTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'stretch' },
  grow: { flex: 1, minWidth: 0 },
  titleText: { flexShrink: 1 },
  titleButtons: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 0 },
  separator: { height: spacing.sm },
  trashLink: {
    minHeight: MIN_TOUCH,
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  pressed: { opacity: 0.6 },
});
