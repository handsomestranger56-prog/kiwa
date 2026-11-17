import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { LibraryDocument, ParseIssue } from '@/core/schema';
import type { SnackbarMessage } from '@/ui/overlays';

/**
 * Saves structural changes straight away: adding, moving and removing lessons, questions and cards.
 * A removal can be undone from the message that follows it, by saving the previous document again.
 */
export function useApply(current: LibraryDocument | null, save: (next: LibraryDocument) => Promise<ParseIssue[]>) {
  const { t } = useTranslation();
  const [snackbar, setSnackbar] = useState<SnackbarMessage | null>(null);

  const fail = () => setSnackbar({ id: Date.now(), text: t('errors.generic') });

  const apply = async (next: LibraryDocument, undoLabel?: string): Promise<boolean> => {
    const previous = current;
    try {
      const issues = await save(next);
      if (issues.length > 0) {
        setSnackbar({ id: Date.now(), text: issues[0].message });
        return false;
      }
      if (undoLabel && previous) {
        setSnackbar({
          id: Date.now(),
          text: undoLabel,
          actionLabel: t('common.undo'),
          onAction: () => {
            save(previous).catch(fail);
          },
        });
      }
      return true;
    } catch {
      fail();
      return false;
    }
  };

  return { apply, snackbar, dismiss: () => setSnackbar(null) };
}
