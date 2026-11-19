import { type ReactNode, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type ViewProps, ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from './icon';
import { AppText } from './text';
import { MAX_CONTENT_WIDTH, spacing, useTheme } from './theme';

/** Fills the screen with the page background and centres a readable column on wide screens. */
export function Page({ style, children, ...rest }: ViewProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.page, { backgroundColor: colors.background }]} {...rest}>
      <View style={[styles.column, style]}>{children}</View>
    </View>
  );
}

/**
 * What a screen shows while it reads its data. Most reads finish in a few milliseconds, so the
 * spinner only appears after a short wait: fast loads show a calm empty page instead of a flicker.
 */
export function Loading({ delay = 250 }: { delay?: number }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [visible, setVisible] = useState(delay <= 0);
  useEffect(() => {
    if (delay <= 0) return;
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);
  return (
    <Page style={styles.loading}>
      {visible ? <ActivityIndicator size="large" color={colors.accent} accessibilityLabel={t('common.loading')} /> : null}
    </Page>
  );
}

/**
 * Padding for screens shown inside the tab bar. The bar sits over the content:
 * at the bottom on phones, and as a floating pill at the top on web.
 */
export function useTabScreenInsets(): { top: number; bottom: number } {
  const insets = useSafeAreaInsets();
  if (Platform.OS === 'web') {
    // Screenshots for the project page draw a phone's status bar and floating tab bar over the web
    // build (tools/capture-screens.js), so screens leave room for those instead of the web tab bar.
    if ((globalThis as { __KIWA_PHONE_FRAME__?: boolean }).__KIWA_PHONE_FRAME__) return { top: spacing.lg, bottom: 110 };
    return { top: 80, bottom: spacing.xl };
  }
  const bar = Platform.OS === 'ios' ? 50 : 80;
  return { top: insets.top + spacing.lg, bottom: insets.bottom + bar + spacing.lg };
}

type EmptyProps = { icon: IconName; title: string; body: string; action?: ReactNode };

export function EmptyState({ icon, title, body, action }: EmptyProps) {
  return (
    <View style={styles.empty}>
      <Icon name={icon} size={40} color="textSecondary" />
      <AppText variant="heading" style={styles.centered}>
        {title}
      </AppText>
      <AppText color="textSecondary" style={styles.centered}>
        {body}
      </AppText>
      {action}
    </View>
  );
}

export function Divider() {
  const { colors } = useTheme();
  return <View style={[styles.divider, { backgroundColor: colors.border }]} />;
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: MAX_CONTENT_WIDTH },
  empty: { alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xxl, paddingVertical: spacing.xxl * 2 },
  centered: { textAlign: 'center' },
  loading: { alignItems: 'center', justifyContent: 'center' },
  divider: { height: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
});
