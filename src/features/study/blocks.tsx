import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Block } from '@/core/schema';
import { cleanSvg } from '@/core/svg';
import { Markdown } from '@/ui/markdown';
import { AppText } from '@/ui/text';
import { type ColorName, monoFont, radius, spacing, useTheme } from '@/ui/theme';

import { SvgPicture } from './svg-picture';

/** The content of a lesson: text, code, images and callouts, in order. */
export function LessonBlocks({ blocks }: { blocks: readonly Block[] }) {
  return (
    <View style={styles.blocks}>
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} />
      ))}
    </View>
  );
}

function BlockView({ block }: { block: Block }) {
  const { t } = useTranslation();
  const { colors } = useTheme();

  switch (block.type) {
    case 'text':
      return <Markdown source={block.markdown} />;

    case 'code':
      return (
        <View style={[styles.code, { backgroundColor: colors.surfaceAlt }]}>
          {block.language ? (
            <AppText variant="label" color="textSecondary">
              {block.language}
            </AppText>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Text selectable style={[styles.codeText, { color: colors.text }]}>
              {block.code}
            </Text>
          </ScrollView>
        </View>
      );

    case 'image':
      return (
        <View style={styles.image}>
          <Image
            source={{ uri: block.url }}
            accessibilityLabel={block.alt}
            contentFit="contain"
            style={[styles.picture, { backgroundColor: colors.surfaceAlt }]}
          />
          {block.caption ? (
            <AppText variant="small" color="textSecondary">
              {block.caption}
            </AppText>
          ) : null}
        </View>
      );

    case 'svg': {
      // Cleaned again here: content saved by an older version, or edited by hand, gets the same care.
      const cleaned = cleanSvg(block.svg);
      if (!cleaned.ok) return null;
      return (
        <View style={styles.image}>
          <SvgPicture svg={cleaned.svg} alt={block.alt} />
          {block.caption ? (
            <AppText variant="small" color="textSecondary">
              {block.caption}
            </AppText>
          ) : null}
        </View>
      );
    }

    case 'callout': {
      const look = {
        note: { background: colors.surfaceAlt, text: 'textSecondary' },
        tip: { background: colors.accentSoft, text: 'accent' },
        warning: { background: colors.warmSoft, text: 'warm' },
      }[block.tone] as { background: string; text: ColorName };
      return (
        <View style={[styles.callout, { backgroundColor: look.background }]}>
          <AppText variant="label" color={look.text}>
            {t(`callout.${block.tone}`)}
          </AppText>
          <Markdown source={block.markdown} />
        </View>
      );
    }
  }
}

const styles = StyleSheet.create({
  blocks: { gap: spacing.lg },
  code: { borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  codeText: { fontFamily: monoFont, fontSize: 14, lineHeight: 21 },
  image: { gap: spacing.sm },
  picture: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md },
  callout: { borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
});
