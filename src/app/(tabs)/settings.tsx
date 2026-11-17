import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useData, useQuery } from '@/data/provider';
import { TextField } from '@/ui/controls';
import { Icon } from '@/ui/icon';
import { Page, useTabScreenInsets } from '@/ui/layout';
import { AppText } from '@/ui/text';
import { MIN_TOUCH, radius, spacing, useTheme } from '@/ui/theme';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useTabScreenInsets();
  const { colors } = useTheme();
  const name = useQuery('settings:name', ({ settings }) => settings.get('profile.name'));

  return (
    <Page>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <AppText variant="title" accessibilityRole="header">
          {t('settings.title')}
        </AppText>

        <View style={styles.section}>
          <AppText variant="label" color="textSecondary">
            {t('settings.profile')}
          </AppText>
          {/* Mounted once the stored name is known, so the field starts with it. */}
          {name.loading ? null : <NameField stored={name.data ?? ''} />}
        </View>

        <View style={styles.section}>
          <AppText variant="label" color="textSecondary">
            {t('settings.data')}
          </AppText>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/trash')}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: colors.surface, borderColor: colors.border },
              pressed && styles.pressed,
            ]}>
            <Icon name="trash" color="textSecondary" />
            <AppText style={styles.rowText}>{t('settings.openTrash')}</AppText>
            <Icon name="chevron" size={18} color="textSecondary" />
          </Pressable>
          <AppText variant="small" color="textSecondary">
            {t('settings.storage')}
          </AppText>
        </View>

        <View style={styles.section}>
          <AppText variant="label" color="textSecondary">
            {t('settings.about')}
          </AppText>
          <AppText variant="small" color="textSecondary">
            {t('settings.version', { version: Constants.expoConfig?.version ?? '0' })}
          </AppText>
        </View>
      </ScrollView>
    </Page>
  );
}

function NameField({ stored }: { stored: string }) {
  const { t } = useTranslation();
  const { settings } = useData();
  const [value, setValue] = useState(stored);
  const [saved, setSaved] = useState(false);

  const save = () => {
    const trimmed = value.trim();
    if (trimmed === stored) return;
    const write = trimmed ? settings.set('profile.name', trimmed) : settings.clear('profile.name');
    write.then(() => setSaved(true)).catch(() => setSaved(false));
  };

  return (
    <>
      <TextField
        value={value}
        onChangeText={(text) => {
          setValue(text);
          setSaved(false);
        }}
        onBlur={save}
        onSubmitEditing={save}
        placeholder={t('settings.namePlaceholder')}
        accessibilityLabel={t('settings.name')}
        autoComplete="name"
        returnKeyType="done"
        maxLength={80}
      />
      {saved ? (
        <AppText variant="small" color="accent" accessibilityLiveRegion="polite">
          {t('settings.saved')}
        </AppText>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, gap: spacing.xl },
  section: { gap: spacing.sm },
  row: {
    minHeight: MIN_TOUCH + 8,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowText: { flex: 1 },
  pressed: { opacity: 0.6 },
});
