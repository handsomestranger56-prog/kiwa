import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useData, useQuery } from '@/data/provider';
import { applyLanguage, isAppLanguage, LANGUAGES } from '@/i18n';
import { Chip } from '@/ui/controls';
import { AppText } from '@/ui/text';
import { spacing } from '@/ui/theme';

const useStoredLanguage = () => useQuery('settings:language', ({ settings }) => settings.get('app.language'));

/** Keeps the app in the language the person chose, or the phone's language until they choose. */
export function LanguageSync() {
  const stored = useStoredLanguage();
  useEffect(() => {
    if (!stored.loading) applyLanguage(stored.data ?? null);
  }, [stored.loading, stored.data]);
  return null;
}

/** "Same as phone" plus every language the app has. Choosing one switches at once. */
export function LanguagePicker({ showHint = true }: { showHint?: boolean }) {
  const { t } = useTranslation();
  const { settings } = useData();
  const stored = useStoredLanguage();
  const current = isAppLanguage(stored.data) ? stored.data : 'system';

  const choose = (code: string) => {
    const write = code === 'system' ? settings.clear('app.language') : settings.set('app.language', code);
    write.catch(() => {});
  };

  return (
    <View style={styles.section}>
      <AppText variant="label" color="textSecondary">
        {t('language.title')}
      </AppText>
      <View style={styles.chips}>
        <Chip label={t('language.system')} selected={!stored.loading && current === 'system'} onPress={() => choose('system')} />
        {LANGUAGES.map((language) => (
          <Chip key={language.code} label={language.name} selected={current === language.code} onPress={() => choose(language.code)} />
        ))}
      </View>
      {showHint ? (
        <AppText variant="small" color="textSecondary">
          {t('language.hint')}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
