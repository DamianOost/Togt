import type { TextStyle, ViewStyle } from 'react-native';

/**
 * Grounded Momentum primitive values. Product components consume `lightTheme`
 * semantics rather than importing this palette directly.
 */
export const palette = {
  emerald: '#12844E',
  emeraldPressed: '#0D6D40',
  ink: '#0F1F1B',
  cream: '#F7F4EF',
  amber: '#F0A500',
  emergency: '#D32F2F',
  error: '#B42318',
  white: '#FFFFFF',
  emeraldSoft: '#E4F2EA',
  amberSoft: '#FFF3D6',
  redSoft: '#FCE8E7',
  textSecondary: '#4E5C57',
  border: '#D6DED9',
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 40,
  xxxxl: 48,
} as const;

export const sizing = {
  touchTarget: 48,
  controlHeight: 48,
  controlHeightLarge: 56,
  chipHeight: 32,
  appBarMinHeight: 64,
  multilineFieldMinHeight: 112,
  stateGlyph: 56,
  statusDot: 8,
  iconSmall: 20,
  iconMedium: 24,
  iconLarge: 28,
  readableFormWidth: 560,
  readableContentWidth: 720,
} as const;

export const radius = {
  input: 12,
  card: 18,
  hero: 24,
  pill: 999,
} as const;

export const border = {
  thin: 1,
  strong: 2,
} as const;

export const opacity = {
  disabled: 0.46,
  pressed: 0.86,
  muted: 0.72,
  solid: 1,
} as const;

export const elevation: Record<'flat' | 'card' | 'floating', ViewStyle> = {
  flat: {
    elevation: 0,
    shadowOpacity: 0,
  },
  card: {
    elevation: 2,
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
  },
  floating: {
    elevation: 5,
    shadowColor: palette.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
};

export const typography: Record<
  'display' | 'h1' | 'h2' | 'h3' | 'body' | 'bodySmall' | 'label' | 'caption' | 'numeric',
  TextStyle
> = {
  display: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: '800',
    fontFamily: 'Manrope_800ExtraBold',
    letterSpacing: -0.5,
  },
  h1: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800',
    fontFamily: 'Manrope_800ExtraBold',
    letterSpacing: -0.35,
  },
  h2: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: -0.15,
  },
  h3: { fontSize: 18, lineHeight: 24, fontWeight: '700', fontFamily: 'Manrope_700Bold' },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400', fontFamily: 'Inter_400Regular' },
  bodySmall: { fontSize: 14, lineHeight: 20, fontWeight: '400', fontFamily: 'Inter_400Regular' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500', fontFamily: 'Inter_500Medium' },
  numeric: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
    fontFamily: 'Inter_600SemiBold',
    fontVariant: ['tabular-nums'],
  },
};

export const motion = {
  duration: {
    instant: 90,
    quick: 160,
    standard: 240,
    emphasis: 360,
    reduced: 90,
  },
  maxTranslation: 8,
  sheetSpring: {
    damping: 24,
    stiffness: 260,
    mass: 1,
  },
} as const;

export const hapticIntent = {
  offerArrival: 'offer-arrival',
  confirmation: 'confirmation',
  warning: 'warning',
  emergencyActivation: 'emergency-activation',
} as const;

export const semanticColors = {
  canvas: palette.cream,
  surface: palette.white,
  surfaceSubtle: palette.cream,
  surfacePositive: palette.emeraldSoft,
  surfaceAttention: palette.amberSoft,
  surfaceDanger: palette.redSoft,
  surfaceInverse: palette.ink,
  text: palette.ink,
  textSecondary: palette.textSecondary,
  textInverse: palette.white,
  textOnAttention: palette.ink,
  border: palette.border,
  borderStrong: palette.textSecondary,
  focus: palette.emerald,
  actionPrimary: palette.emerald,
  actionPrimaryPressed: palette.emeraldPressed,
  actionSecondary: palette.white,
  actionSecondaryPressed: palette.emeraldSoft,
  actionTertiary: 'transparent',
  actionDanger: palette.emergency,
  attention: palette.amber,
  emergency: palette.emergency,
  error: palette.error,
  success: palette.emerald,
  offline: palette.textSecondary,
  scrim: 'rgba(15, 31, 27, 0.42)',
  translucentSurface: 'rgba(255, 255, 255, 0.94)',
  opaqueSurfaceFallback: palette.white,
} as const;

type SemanticColors = {
  [Key in keyof typeof semanticColors]: string;
};

export type TogtTheme = {
  name: string;
  dark: boolean;
  colors: SemanticColors;
  spacing: typeof spacing;
  sizing: typeof sizing;
  radius: typeof radius;
  border: typeof border;
  opacity: typeof opacity;
  elevation: typeof elevation;
  typography: typeof typography;
  motion: typeof motion;
  hapticIntent: typeof hapticIntent;
};

export const lightTheme: TogtTheme = {
  name: 'grounded-momentum-light',
  dark: false,
  colors: semanticColors,
  spacing,
  sizing,
  radius,
  border,
  opacity,
  elevation,
  typography,
  motion,
  hapticIntent,
};
