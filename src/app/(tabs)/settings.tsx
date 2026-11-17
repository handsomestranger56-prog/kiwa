import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { backupFile } from '@/core/transfer/files';
import { useData, useQuery } from '@/data/provider';
import { ProvidersSection } from '@/features/ai/providers-section';
import { RemindersSection } from '@/features/focus/reminders-section';
import { shareTextFile } from '@/platform/files';
import { TextField } from '@/ui/controls';
import { type IconName, Icon } from '@/ui/icon';
import { Page, useTabScreenInsets } from '@/ui/layout';
import { AppText } from '@/ui/text';
import { MIN_TOUCH, radius, spacing, useTheme } from '@/ui/theme';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useTabScreenInsets();
  const { colors } = useTheme();
  const { backups } = useData();
  const name = useQuery('settings:name', ({ settings }) => settings.get('profile.name'));
  const [backupNote, setBackupNote] = useState<{ ok: boolean; text: string } | null>(null);

  const backUp = () => {
    setBackupNote(null);
    backups
      .create()
      .then(async (backup) => {
        const file = backupFile(backup);
        const result = await shareTextFile(file);
        if (result === 'unavailable') setBackupNote({ ok: false, text: t('errors.generic') });
        else if (result === 'downloaded') setBackupNote({ ok: true, text: t('settings.backedUp', { name: file.name }) });
      })
      .catch(() => setBackupNote({ ok: false, text: t('errors.generic') }));
  };

  const rows: { key: string; icon: IconName; label: string; onPress: () => void }[] = [
    { key: 'backup', icon: 'share', label: t('settings.backup'), onPress: backUp },
    { key: 'import', icon: 'importFile', label: t('settings.importOrRestore'), onPress: () => router.push('/import') },
    { key: 'trash', icon: 'trash', label: t('settings.openTrash'), onPress: () => router.push('/trash') },
  ];

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

        <ProvidersSection />

        <RemindersSection />

        <View style={styles.section}>
          <AppText variant="label" color="textSecondary">
            {t('settings.data')}
          </AppText>
          {rows.map((row) => (
            <Pressable
              key={row.key}
              accessibilityRole="button"
              onPress={row.onPress}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: colors.surface, borderColor: colors.border },
                pressed && styles.pressed,
              ]}>
              <Icon name={row.icon} color="textSecondary" />
              <AppText style={styles.rowText}>{row.label}</AppText>
              <Icon name="chevron" size={18} color="textSecondary" />
            </Pressable>
          ))}
          {backupNote ? (
            <AppText variant="small" color={backupNote.ok ? 'accent' : 'danger'} accessibilityLiveRegion="polite">
              {backupNote.text}
            </AppText>
          ) : null}
          <AppText variant="small" color="textSecondary">
            {t('settings.storage')} {t('settings.backupHint')}
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
