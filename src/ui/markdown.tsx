import { Linking, StyleSheet, Text, View } from 'react-native';

import { type Inline, parseInline, parseMarkdown } from '@/core/markdown';

import { AppText } from './text';
import { type ColorName, monoFont, spacing, useTheme } from './theme';

type Props = { source: string; color?: ColorName };

/** Renders lesson text. See `core/markdown.ts` for what is supported. */
export function Markdown({ source, color = 'text' }: Props) {
  const blocks = parseMarkdown(source);
  return (
    <View style={styles.blocks}>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return (
            <AppText key={index} variant="heading" color={color} accessibilityRole="header">
              <Inlines inlines={block.inlines} />
            </AppText>
          );
        }
        if (block.type === 'list') {
          return (
            <View key={index} style={styles.list}>
              {block.items.map((item, itemIndex) => (
                <View key={itemIndex} style={styles.listItem}>
                  <AppText color="textSecondary" style={styles.marker}>
                    {block.ordered ? `${itemIndex + 1}.` : '•'}
                  </AppText>
                  <AppText color={color} style={styles.listText}>
                    <Inlines inlines={item} />
                  </AppText>
                </View>
              ))}
            </View>
          );
        }
        return (
          <AppText key={index} color={color}>
            <Inlines inlines={block.inlines} />
          </AppText>
        );
      })}
    </View>
  );
}

/** One line of text with bold, italic, code and links, for use inside an `AppText`. */
export function InlineMarkdown({ source }: { source: string }) {
  return <Inlines inlines={parseInline(source)} />;
}

function Inlines({ inlines }: { inlines: Inline[] }) {
  const { colors } = useTheme();
  return (
    <>
      {inlines.map((inline, index) => {
        if (inline.href) {
          const href = inline.href;
          return (
            <Text
              key={index}
              accessibilityRole="link"
              onPress={() => {
                void Linking.openURL(href);
              }}
              style={[styles.link, { color: colors.accent }]}>
              {inline.text}
            </Text>
          );
        }
        if (inline.code) {
          return (
            <Text key={index} style={[styles.code, { backgroundColor: colors.surfaceAlt }]}>
              {inline.text}
            </Text>
          );
        }
        if (inline.bold || inline.italic) {
          return (
            <Text key={index} style={[inline.bold && styles.bold, inline.italic && styles.italic]}>
              {inline.text}
            </Text>
          );
        }
        return inline.text;
      })}
    </>
  );
}

const styles = StyleSheet.create({
  blocks: { gap: spacing.md },
  list: { gap: spacing.xs },
  listItem: { flexDirection: 'row', gap: spacing.sm },
  marker: { minWidth: 20, textAlign: 'right' },
  listText: { flex: 1, minWidth: 0 },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  code: { fontFamily: monoFont, fontSize: 14 },
  link: { textDecorationLine: 'underline' },
});
