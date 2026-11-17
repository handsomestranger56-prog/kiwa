import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useData } from '@/data/provider';
import { Button, TextField } from '@/ui/controls';
import { type IconName, Icon } from '@/ui/icon';
import { Page } from '@/ui/layout';
import { AppText } from '@/ui/text';
import { radius, spacing, useTheme } from '@/ui/theme';

const POINTS: { key: 'learn' | 'create' | 'remember'; icon: IconName }[] = [
  { key: 'learn', icon: 'course' },
  { key: 'create', icon: 'ai' },
  { key: 'remember', icon: 'timer' },
];

/** Shown once, on first launch. */
export default function WelcomeScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { settings } = useData();
  const [name, setName] = useState('');

  const begin = async () => {
    if (name.trim()) await settings.set('profile.name', name.trim()).catch(() => {});
    await settings.set('onboarding.done', '1').catch(() => {});
    router.replace('/');
  };

  return (
    <Page>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xxl }]}>
        <AppText variant="title" accessibilityRole="header">
          {t('welcome.title')}
        </AppText>
        <AppText color="textSecondary">{t('welcome.intro')}</AppText>

        {POINTS.map((point) => (
          <View key={point.key} style={styles.point}>
            <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
              <Icon name={point.icon} color="accent" />
            </View>
            <View style={styles.text}>
              <AppText variant="bodyStrong">{t(`welcome.${point.key}.title`)}</AppText>
              <AppText color="textSecondary">{t(`welcome.${point.key}.body`)}</AppText>
            </View>
          </View>
        ))}

        <View style={styles.name}>
          <AppText variant="label" color="textSecondary">
            {t('welcome.name')}
          </AppText>
          <TextField value={name} onChangeText={setName} placeholder={t('settings.namePlaceholder')} accessibilityLabel={t('welcome.name')} autoComplete="name" maxLength={80} />
        </View>

        <Button label={t('welcome.start')} onPress={() => void begin()} />
        <AppText variant="small" color="textSecondary">
          {t('welcome.privacy')}
        </AppText>
      </ScrollView>
    </Page>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.xl, gap: spacing.xl },
  point: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
  badge: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { gap: spacing.sm },
});
