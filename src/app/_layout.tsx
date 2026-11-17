import '@/i18n';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DataProvider } from '@/data/provider';
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
        }}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <DataProvider onReady={() => SplashScreen.hide()} renderError={(error) => <StartupError error={error} />}>
          <Stack screenOptions={{ headerShadowVisible: false, headerBackButtonDisplayMode: 'minimal' }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="trash" options={{ title: t('trash.title') }} />
          </Stack>
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
