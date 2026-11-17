import { Platform, useColorScheme } from 'react-native';

export const palettes = {
  light: {
    background: '#F2F4F7',
    surface: '#FFFFFF',
    surfaceAlt: '#E7ECF2',
    text: '#17212E',
    textSecondary: '#586475',
    border: '#C9D2DD',
    accent: '#0A6E7A',
    accentSoft: '#D8EEF0',
    onAccent: '#FFFFFF',
    warm: '#9A5200',
    warmSoft: '#F6E8D3',
    danger: '#B3261E',
    onDanger: '#FFFFFF',
    scrim: 'rgba(15, 20, 27, 0.45)',
  },
  dark: {
    background: '#0F141B',
    surface: '#171E28',
    surfaceAlt: '#1C2531',
    text: '#E5EAF1',
    textSecondary: '#98A4B5',
    border: '#303C4C',
    accent: '#4CC3CF',
    accentSoft: '#12343A',
    onAccent: '#06262B',
    warm: '#E7A552',
    warmSoft: '#3A2A12',
    danger: '#F2867E',
    onDanger: '#3B0A07',
    scrim: 'rgba(0, 0, 0, 0.6)',
  },
} as const;

export type Palette = { [K in keyof typeof palettes.light]: string };
export type ColorName = keyof Palette;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;

/** Wide screens keep a readable column instead of stretching edge to edge. */
export const MAX_CONTENT_WIDTH = 720;

/** The smallest comfortable touch target on both platforms. */
export const MIN_TOUCH = 44;

export const monoFont = Platform.select({ ios: 'ui-monospace', android: 'monospace', default: 'monospace' });

export function useTheme(): { colors: Palette; dark: boolean } {
  const dark = useColorScheme() === 'dark';
  return { colors: dark ? palettes.dark : palettes.light, dark };
}
