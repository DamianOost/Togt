import { useWindowDimensions } from 'react-native';
import { sizing, spacing } from './tokens';

export type LayoutSize = 'compact' | 'standard' | 'large';

export const breakpoints = {
  standard: 360,
  large: 430,
} as const;

export type LayoutMetrics = {
  size: LayoutSize;
  width: number;
  horizontalPadding: number;
  contentMaxWidth: number;
  formMaxWidth: number;
  supportsPairedCards: boolean;
};

export function getLayoutSize(width: number): LayoutSize {
  if (width < breakpoints.standard) return 'compact';
  if (width < breakpoints.large) return 'standard';
  return 'large';
}

export function getLayoutMetrics(width: number): LayoutMetrics {
  const size = getLayoutSize(width);

  return {
    size,
    width,
    horizontalPadding: size === 'compact' ? spacing.md : spacing.lg,
    contentMaxWidth: sizing.readableContentWidth,
    formMaxWidth: sizing.readableFormWidth,
    supportsPairedCards: size === 'large',
  };
}

export function useLayoutMetrics(): LayoutMetrics {
  const { width } = useWindowDimensions();
  return getLayoutMetrics(width);
}
