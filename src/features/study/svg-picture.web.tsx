import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { svgAspectRatio, svgDataUri } from '@/core/svg';
import { useTheme } from '@/ui/theme';

type Props = { svg: string; alt?: string };

/** Draws a cleaned SVG picture in the browser as an image, which never runs scripts. Animation plays. */
export function SvgPicture({ svg, alt }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const height = width > 0 ? width / svgAspectRatio(svg) : 0;
  return (
    <View onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={[styles.frame, { height: height || 1, backgroundColor: colors.surfaceAlt }]}>
      {width > 0 ? <Image source={{ uri: svgDataUri(svg) }} accessibilityLabel={alt} alt={alt} contentFit="contain" style={styles.view} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', overflow: 'hidden', borderRadius: 8 },
  view: { flex: 1 },
});
