import { Stack } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { LibraryItem } from '@/data/library-repository';
import { useData, useQuery } from '@/data/provider';
import { Button } from '@/ui/controls';
import { Icon } from '@/ui/icon';
import { EmptyState, Page } from '@/ui/layout';
import { ConfirmDialog } from '@/ui/overlays';
import { AppText } from '@/ui/text';
import { radius, spacing, useTheme } from '@/ui/theme';

export default function TrashScreen() {
  const { t } = useTranslation();
  const { library } = useData();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const items = useQuery('trash', (data) => data.library.list({ trashed: true }));
  const [deleting, setDeleting] = useState<LibraryItem | null>(null);
  const [emptying, setEmptying] = useState(false);
  const [failed, setFailed] = useState(false);

  const list = items.data ?? [];
  const run = (work: Promise<unknown>) => {
    setFailed(false);
    work.catch(() => setFailed(true));
  };

  return (
    <Page>
      <Stack.Screen options={{ title: t('trash.title') }} />
      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}
        ListHeaderComponent={
          <View style={styles.header}>
            {failed ? <AppText color="danger">{t('errors.generic')}</AppText> : null}
            {list.length > 0 ? (
              <View style={styles.headerButton}>
                <Button kind="secondary" icon="trash" label={t('trash.emptyTrash')} onPress={() => setEmptying(true)} />
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.rowTop}>
              <Icon name={item.kind} color="textSecondary" />
              <View style={styles.rowText}>
                <AppText variant="bodyStrong" numberOfLines={2}>
                  {item.title}
                </AppText>
                <AppText variant="small" color="textSecondary">
                  {t(`kind.${item.kind}`)} · {t(`units.${item.kind}`, { count: item.unitCount })}
                </AppText>
              </View>
            </View>
            <View style={styles.rowButtons}>
              <Button kind="plain" label={t('trash.deleteForever')} onPress={() => setDeleting(item)} />
              <Button kind="secondary" icon="restore" label={t('trash.restore')} onPress={() => run(library.restore(item.id))} />
            </View>
          </View>
        )}
        ItemSeparatorComponent={Separator}
        ListEmptyComponent={
          items.loading ? undefined : (
            <EmptyState icon="trash" title={t('trash.empty.title')} body={t('trash.empty.body')} />
          )
        }
      />
      <ConfirmDialog
        visible={deleting !== null}
        danger
        title={deleting ? t('trash.confirmDelete.title', { title: deleting.title }) : ''}
        body={t('trash.confirmDelete.body')}
        confirmLabel={t('trash.deleteForever')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => {
          if (deleting) run(library.purge(deleting.id));
        }}
        onClose={() => setDeleting(null)}
      />
      <ConfirmDialog
        visible={emptying}
        danger
        title={t('trash.confirmEmpty.title', { count: list.length })}
        body={t('trash.confirmEmpty.body')}
        confirmLabel={t('trash.emptyTrash')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => run(library.emptyTrash())}
        onClose={() => setEmptying(false)}
      />
    </Page>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  list: { padding: spacing.lg, flexGrow: 1 },
  header: { gap: spacing.md, paddingBottom: spacing.md },
  headerButton: { alignSelf: 'flex-end' },
  row: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowText: { flex: 1, minWidth: 0 },
  rowButtons: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: spacing.sm },
  separator: { height: spacing.sm },
});
