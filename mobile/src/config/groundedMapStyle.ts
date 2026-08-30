import { semanticColors } from '../design/tokens';

/**
 * A quiet map treatment that keeps provider data legible while matching the
 * Grounded Momentum cream, ink and emerald product surfaces.
 */
export const GROUNDED_LIGHT_MAP_STYLE = Object.freeze([
  Object.freeze({
    elementType: 'geometry',
    stylers: [Object.freeze({ color: semanticColors.surfaceSubtle })],
  }),
  Object.freeze({
    elementType: 'labels.text.fill',
    stylers: [Object.freeze({ color: semanticColors.textSecondary })],
  }),
  Object.freeze({
    elementType: 'labels.text.stroke',
    stylers: [Object.freeze({ color: semanticColors.surface })],
  }),
  Object.freeze({
    featureType: 'poi',
    elementType: 'geometry',
    stylers: [Object.freeze({ color: semanticColors.surfacePositive })],
  }),
  Object.freeze({
    featureType: 'poi',
    elementType: 'labels.icon',
    stylers: [Object.freeze({ visibility: 'off' })],
  }),
  Object.freeze({
    featureType: 'road',
    elementType: 'geometry',
    stylers: [Object.freeze({ color: semanticColors.surface })],
  }),
  Object.freeze({
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [Object.freeze({ color: semanticColors.border })],
  }),
  Object.freeze({
    featureType: 'transit',
    stylers: [Object.freeze({ visibility: 'off' })],
  }),
  Object.freeze({
    featureType: 'water',
    elementType: 'geometry',
    stylers: [Object.freeze({ color: semanticColors.surfacePositive })],
  }),
]);

export default GROUNDED_LIGHT_MAP_STYLE;
