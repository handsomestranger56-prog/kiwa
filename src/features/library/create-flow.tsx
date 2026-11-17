import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { type DocumentKind, DOCUMENT_KINDS } from '@/core/schema';
import { blankDocument } from '@/core/templates/blank';
import { useData } from '@/data/provider';
import i18n from '@/i18n';
import { ActionSheet, PromptDialog } from '@/ui/overlays';

type Options = {
  onCreated: (id: string) => void;
  onError: () => void;
  onCreateWithAi: () => void;
  onImport: () => void;
};

/** The "New" menu: create with AI, import, or start an empty course, quiz or deck. */
export function useCreateFlow({ onCreated, onError, onCreateWithAi, onImport }: Options) {
  const { t } = useTranslation();
  const { library } = useData();
  const [choosing, setChoosing] = useState(false);
  const [kind, setKind] = useState<DocumentKind | null>(null);

  const create = (chosen: DocumentKind, title: string) => {
    const document = blankDocument(chosen, title, { language: i18n.language });
    library
      .add(document)
      .then((item) => onCreated(item.id))
      .catch(onError);
  };

  const overlays = (
    <>
      <ActionSheet
        visible={choosing}
        title={t('create.title')}
        onClose={() => setChoosing(false)}
        actions={[
          { key: 'ai', icon: 'ai', label: t('create.withAi.label'), hint: t('create.withAi.hint'), onPress: onCreateWithAi },
          { key: 'import', icon: 'importFile', label: t('create.importItem.label'), hint: t('create.importItem.hint'), onPress: onImport },
          ...DOCUMENT_KINDS.map((option) => ({
            key: option,
            icon: option,
            label: t(`create.${option}.label`),
            hint: t(`create.${option}.hint`),
            onPress: () => setKind(option),
          })),
        ]}
      />
      <PromptDialog
        visible={kind !== null}
        title={kind ? t(`create.nameTitle.${kind}`) : ''}
        placeholder={t('create.namePlaceholder')}
        confirmLabel={t('common.create')}
        cancelLabel={t('common.cancel')}
        onSubmit={(title) => {
          if (kind) create(kind, title);
        }}
        onClose={() => setKind(null)}
      />
    </>
  );

  return { start: () => setChoosing(true), overlays };
}
