import type { ReactNode } from 'react';
import { type ViewProps, Platform, StyleSheet, View } from 'react-native';
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
 * Padding for screens shown inside the tab bar. The bar sits over the content:
 * at the bottom on phones, and as a floating pill at the top on web.
 */
export function useTabScreenInsets(): { top: number; bottom: number } {
  const insets = useSafeAreaInsets();
  if (Platform.OS === 'web') {
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
  divider: { height: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
});
