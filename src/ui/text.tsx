import { type TextProps, StyleSheet, Text } from 'react-native';

import { type ColorName, useTheme } from './theme';

type Variant = 'title' | 'heading' | 'body' | 'bodyStrong' | 'small' | 'label';

type Props = TextProps & { variant?: Variant; color?: ColorName };

export function AppText({ variant = 'body', color = 'text', style, ...rest }: Props) {
  const { colors } = useTheme();
  return <Text style={[styles[variant], { color: colors[color] }, style]} {...rest} />;
}

const styles = StyleSheet.create({
  title: { fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.4 },
  heading: { fontSize: 19, lineHeight: 26, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  small: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
});
