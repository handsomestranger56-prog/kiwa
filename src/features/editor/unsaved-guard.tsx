import { usePreventRemove } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfirmDialog } from '@/ui/overlays';

/**
 * Asks before the screen is left with Back (header, hardware button or gesture) while `dirty`.
 * Render `dialog` on the screen, and call `leave` to go without asking, for example after a save.
 */
export function useUnsavedGuard(dirty: boolean) {
  const { t } = useTranslation();
  const [leaving, setLeaving] = useState(false);
  const [blocked, setBlocked] = useState<(() => void) | null>(null);
  const disablePrevention = usePreventRemove(dirty && !leaving, ({ repeat }) => setBlocked(() => repeat));

  const leave = (go: () => void) => {
    setLeaving(true);
    disablePrevention();
    go();
  };

  const dialog = (
    <ConfirmDialog
      visible={blocked !== null}
      danger
      title={t('editor.unsaved.title')}
      body={t('editor.unsaved.body')}
      confirmLabel={t('editor.unsaved.discard')}
      cancelLabel={t('editor.unsaved.keep')}
      onConfirm={() => {
        const repeat = blocked;
        setLeaving(true);
        repeat?.();
      }}
      onClose={() => setBlocked(null)}
    />
  );

  return { dialog, leave };
}
