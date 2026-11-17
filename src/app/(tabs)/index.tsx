import { useRouter } from 'expo-router';
import { useDeferredValue, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { DocumentKind } from '@/core/schema';
import type { LibraryFilter } from '@/data/library-repository';
import { useQuery } from '@/data/provider';
import { JobsBanner } from '@/features/ai/jobs-banner';
import { useCreateFlow } from '@/features/library/create-flow';
import { useItemActions } from '@/features/library/item-actions';
import { ItemRow } from '@/features/library/item-row';
import { Button, Chip, IconButton, TextField } from '@/ui/controls';
import { Icon } from '@/ui/icon';
import { EmptyState, Page, useTabScreenInsets } from '@/ui/layout';
import { Snackbar } from '@/ui/overlays';
import { AppText } from '@/ui/text';
import { MIN_TOUCH, spacing } from '@/ui/theme';

type FilterKey = 'all' | DocumentKind | 'favorites';
const FILTERS: FilterKey[] = ['all', 'course', 'quiz', 'deck', 'favorites'];

export default function LibraryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useTabScreenInsets();
  const [filter, setFilter] = useState<FilterKey>('all');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);

  const query: LibraryFilter = {
    search: deferredSearch,
    kind: filter === 'all' || filter === 'favorites' ? undefined : filter,
    favorite: filter === 'favorites',
  };
  const items = useQuery(`library:${filter}:${deferredSearch}`, ({ library }) => library.list(query));
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

  const filtering = filter !== 'all' || deferredSearch.trim() !== '';
  const trashCount = trash.data ?? 0;

  return (
    <Page>
      <FlatList
        data={items.data ?? []}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.list, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <AppText variant="title" accessibilityRole="header">
                {t('library.title')}
              </AppText>
              <Button icon="add" label={t('library.new')} onPress={create.start} />
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
            <JobsBanner />
          </View>
        }
        renderItem={({ item }) => (
          <ItemRow
            item={item}
            onOpen={() => open(item.id)}
            onToggleFavorite={() => actions.toggleFavorite(item)}
            onMore={() => actions.open(item)}
          />
        )}
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
