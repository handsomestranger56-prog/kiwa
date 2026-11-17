import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { documentFile } from '@/core/transfer/files';
import type { LibraryItem } from '@/data/library-repository';
import { useData } from '@/data/provider';
import { shareTextFile } from '@/platform/files';
import { type SheetAction, type SnackbarMessage, ActionSheet, PromptDialog } from '@/ui/overlays';

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
  const { library } = useData();
  const router = useRouter();
  const [target, setTarget] = useState<LibraryItem | null>(null);
  const [renaming, setRenaming] = useState<LibraryItem | null>(null);
  const [snackbar, setSnackbar] = useState<SnackbarMessage | null>(null);

  const fail = () => setSnackbar({ id: Date.now(), text: t('errors.generic') });

  const toggleFavorite = (item: LibraryItem) => {
    library.setMark(item.id, 'favorite', !item.favorite).catch(fail);
  };

  const exportItem = (item: LibraryItem) => {
    library
      .getDocument(item.id)
      .then(async (document) => {
        if (!document) throw new Error('missing');
        const file = documentFile(document);
        const result = await shareTextFile(file);
        if (result === 'unavailable') fail();
        else if (result === 'downloaded') setSnackbar({ id: Date.now(), text: t('actions.exported', { name: file.name }) });
      })
      .catch(fail);
  };

  const remove = (item: LibraryItem) => {
    library
      .remove(item.id)
      .then(() => {
        setSnackbar({
          id: Date.now(),
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
