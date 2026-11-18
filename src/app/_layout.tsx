import '@/i18n';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DataProvider } from '@/data/provider';
import { JobRunnerProvider } from '@/features/ai/job-runner';
import { FocusProvider } from '@/features/focus/focus-provider';
import { NotificationsSync } from '@/features/focus/notifications-sync';
import { LanguageSync } from '@/features/settings/language';
import { AppText } from '@/ui/text';
import { monoFont, spacing, useTheme } from '@/ui/theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { t } = useTranslation();
  const { colors, dark } = useTheme();
  const base = dark ? DarkTheme : DefaultTheme;

  return (
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider
        value={{
          ...base,
          colors: {
            ...base.colors,
            background: colors.background,
            card: colors.background,
            text: colors.text,
            border: colors.border,
            primary: colors.accent,
          },
        }}
      >
        <StatusBar style={dark ? 'light' : 'dark'} />
        <DataProvider
          onReady={() => SplashScreen.hide()}
          renderError={(error) => <StartupError error={error} />}
        >
          <JobRunnerProvider>
            <FocusProvider>
              <LanguageSync />
              <NotificationsSync />
              <Stack
                screenOptions={{
                  headerShadowVisible: false,
                  headerBackButtonDisplayMode: 'minimal',
                  // Screens set their own titles once their data loads. Until then the header stays
                  // empty rather than falling back to the route's file path.
                  title: '',
                }}
              >
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="trash" options={{ title: t('trash.title') }} />
                <Stack.Screen name="create" options={{ title: t('create.screenTitle') }} />
                <Stack.Screen name="import" options={{ title: t('import.title') }} />
                <Stack.Screen name="review-session" options={{ title: t('review.title') }} />
                <Stack.Screen name="job/[id]" options={{ title: t('job.title') }} />
                <Stack.Screen name="item/[id]/result/[attemptId]" options={{ title: t('result.title') }} />
                <Stack.Screen name="item/[id]/edit/index" options={{ title: t('editor.edit') }} />
                <Stack.Screen
                  name="welcome"
                  options={{ headerShown: false, gestureEnabled: false }}
                />
              </Stack>
            </FocusProvider>
          </JobRunnerProvider>
        </DataProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function StartupError({ error }: { error: Error }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.error}>
        <AppText variant="title">{t('errors.startup.title')}</AppText>
        <AppText color="textSecondary">{t('errors.startup.body')}</AppText>
        <AppText variant="small" selectable style={{ fontFamily: monoFont }}>
          {error.message}
        </AppText>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  error: { padding: spacing.xl, gap: spacing.lg },
});
