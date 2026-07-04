// OLED true-black theme. Backgrounds are pure #000 so unlit pixels stay off
// (battery). Text is high-contrast for readability at speed / in sunlight.
export const theme = {
  colors: {
    bg: '#000000',
    surface: '#0E0E0E',
    surfaceAlt: '#1A1A1A',
    border: '#262626',
    text: '#ffffff',
    textDim: '#9A9A9A',
    accent: '#4C9EFF',
    danger: '#FF453A',
    warning: '#FFD60A',
    success: '#30D158',
  },
  spacing: (n: number) => n * 8,
  radius: { sm: 8, md: 14, lg: 22 },
  font: { h1: 30, h2: 22, body: 16, small: 13, mono: 14 },
  // Roboto Condensed everywhere. Android doesn't synthesize weights for loaded
  // font files, so each weight is its own family — use these instead of fontWeight.
  family: {
    regular: 'RobotoCondensed_400Regular',
    medium: 'RobotoCondensed_500Medium',
    bold: 'RobotoCondensed_700Bold',
    extraBold: 'RobotoCondensed_800ExtraBold',
  },
} as const;

export type Theme = typeof theme;
