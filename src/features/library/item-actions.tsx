import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { documentFile } from '@/core/transfer/files';
import type { LibraryItem } from '@/data/library-repository';
import type { GroupSummary } from '@/data/groups-repository';
import { useData, useQuery } from '@/data/provider';
import { shareTextFile } from '@/platform/files';
import { type SheetAction, type SnackbarMessage, ActionSheet, PromptDialog } from '@/ui/overlays';

/** Snackbar messages need a new id each time so the same text shows again. */
let snackbarCount = 0;
const nextSnackbarId = () => (snackbarCount += 1);

type Options = {
  /** Called after an item has been moved to the trash. */
  onRemoved?: (item: LibraryItem) => void;
};

/**
 * Rename, favorite, complete and remove for one library item.
 * Render `overlays` once and call `open(item)` from a row or a header button.
 */
export function useItemActions({ onRemoved }: Options = {}) {
  const { t } = useTranslation();
  const { library, groups } = useData();
  const router = useRouter();
  const [target, setTarget] = useState<LibraryItem | null>(null);
  const [renaming, setRenaming] = useState<LibraryItem | null>(null);
  const [moving, setMoving] = useState<LibraryItem | null>(null);
  const [naming, setNaming] = useState<LibraryItem | null>(null);
  const groupList = useQuery('groups:list', ({ groups: all }) => all.list()).data ?? [];
  const [snackbar, setSnackbar] = useState<SnackbarMessage | null>(null);

  const fail = () => setSnackbar({ id: nextSnackbarId(), text: t('errors.generic') });

  const toggleFavorite = (item: LibraryItem) => {
    library.setMark(item.id, 'favorite', !item.favorite).catch(fail);
  };

  const exportItem = (item: LibraryItem) => {
    library
      .getDocument(item.id)
      .then(async (document) => {
        if (!document) throw new Error('missing');
        const group = item.groupId ? await groups.get(item.groupId) : null;
        const file = documentFile(document, group?.name);
        const result = await shareTextFile(file);
        if (result === 'unavailable') fail();
        else if (result === 'downloaded') setSnackbar({ id: nextSnackbarId(), text: t('actions.exported', { name: file.name }) });
      })
      .catch(fail);
  };

  const move = (item: LibraryItem, group: Pick<GroupSummary, 'id' | 'name'> | null) => {
    library
      .setGroup([item.id], group?.id ?? null)
      .then(() => setSnackbar({ id: nextSnackbarId(), text: group ? t('actions.movedTo', { group: group.name }) : t('actions.ungrouped') }))
      .catch(fail);
  };

  const groupActions: SheetAction[] = moving
    ? [
        ...groupList.map((group) => ({
          key: group.id,
          icon: group.id === moving.groupId ? ('check' as const) : ('folder' as const),
          label: group.name,
          onPress: () => move(moving, group),
        })),
        ...(moving.groupId ? [{ key: 'none', icon: 'close' as const, label: t('groups.none'), onPress: () => move(moving, null) }] : []),
        { key: 'new', icon: 'add', label: t('groups.new'), onPress: () => setNaming(moving) },
      ]
    : [];

  const remove = (item: LibraryItem) => {
    library
      .remove(item.id)
      .then(() => {
        setSnackbar({
          id: nextSnackbarId(),
          text: t('library.movedToTrash', { title: item.title }),
          actionLabel: t('common.undo'),
          onAction: () => {
            library.restore(item.id).catch(fail);
          },
        });
        onRemoved?.(item);
      })
      .catch(fail);
  };

  const actions: SheetAction[] = target
    ? [
        {
          key: 'edit',
          icon: 'edit',
          label: t('editor.edit'),
          onPress: () => router.push({ pathname: '/item/[id]/edit', params: { id: target.id } }),
        },
        { key: 'rename', icon: 'edit', label: t('actions.rename'), onPress: () => setRenaming(target) },
        {
          key: 'favorite',
          icon: target.favorite ? 'starFilled' : 'star',
          label: target.favorite ? t('actions.removeFavorite') : t('actions.addFavorite'),
          onPress: () => toggleFavorite(target),
        },
        {
          key: 'completed',
          icon: target.completed ? 'circle' : 'checkCircle',
          label: target.completed ? t('actions.markNotCompleted') : t('actions.markCompleted'),
          onPress: () => {
            library.setMark(target.id, 'completed', !target.completed).catch(fail);
          },
        },
        { key: 'group', icon: 'folder', label: t('actions.moveToGroup'), onPress: () => setMoving(target) },
        { key: 'export', icon: 'share', label: t('actions.export'), onPress: () => exportItem(target) },
        { key: 'remove', icon: 'trash', label: t('actions.moveToTrash'), danger: true, onPress: () => remove(target) },
      ]
    : [];

  const overlays = (
    <>
      <ActionSheet
        visible={target !== null}
        title={target ? t('actions.title', { title: target.title }) : ''}
        actions={actions}
        onClose={() => setTarget(null)}
      />
      <PromptDialog
        visible={renaming !== null}
        title={t('actions.renameTitle')}
        initialValue={renaming?.title}
        placeholder={t('create.namePlaceholder')}
        confirmLabel={t('common.save')}
        cancelLabel={t('common.cancel')}
        onSubmit={(title) => {
          if (renaming) library.rename(renaming.id, title).catch(fail);
        }}
        onClose={() => setRenaming(null)}
      />
      <ActionSheet
        visible={moving !== null}
        title={moving ? t('actions.moveTitle', { title: moving.title }) : ''}
        actions={groupActions}
        onClose={() => setMoving(null)}
      />
      <PromptDialog
        visible={naming !== null}
        title={t('groups.new')}
        placeholder={t('groups.namePlaceholder')}
        confirmLabel={t('common.create')}
        cancelLabel={t('common.cancel')}
        onSubmit={(name) => {
          const item = naming;
          if (!item) return;
          groups
            .ensure(name)
            .then((group) => move(item, group))
            .catch(fail);
        }}
        onClose={() => setNaming(null)}
      />
    </>
  );

  return {
    open: setTarget,
    toggleFavorite,
    overlays,
    snackbar,
    dismissSnackbar: () => setSnackbar(null),
    showError: fail,
  };
}
