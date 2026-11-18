import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { svgAspectRatio, svgPage } from '@/core/svg';
import { useTheme } from '@/ui/theme';

type Props = { svg: string; alt?: string };

/**
 * Draws a cleaned SVG picture on a phone. A web view shows it exactly as a browser would,
 * animation included, with JavaScript off, no network and no way to navigate away.
 */
export function SvgPicture({ svg, alt }: Props) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const height = width > 0 ? width / svgAspectRatio(svg) : 0;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={alt}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.frame, { height: height || 1, backgroundColor: colors.surfaceAlt }]}>
      {width > 0 ? (
        <WebView
          source={{ html: svgPage(svg, colors.surfaceAlt) }}
          originWhitelist={['about:blank']}
          javaScriptEnabled={false}
          domStorageEnabled={false}
          allowFileAccess={false}
          allowsLinkPreview={false}
          scrollEnabled={false}
          bounces={false}
          overScrollMode="never"
          setSupportMultipleWindows={false}
          onShouldStartLoadWithRequest={(request) => request.url === 'about:blank' || request.url.startsWith('data:')}
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={[styles.view, { backgroundColor: colors.surfaceAlt }]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', overflow: 'hidden', borderRadius: 8 },
  view: { flex: 1 },
});
