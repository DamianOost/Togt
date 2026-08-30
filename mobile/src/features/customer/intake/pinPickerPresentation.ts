import type { AddressDetails, Coordinates } from './model';

export type MapRegion = Coordinates & Readonly<{
  latitudeDelta: number;
  longitudeDelta: number;
}>;

export const SOUTH_AFRICA_OVERVIEW_REGION: MapRegion = Object.freeze({
  latitude: -30.5595,
  longitude: 22.9375,
  latitudeDelta: 12,
  longitudeDelta: 12,
});

export function addressDisplayLabel(details: AddressDetails): string {
  return [
    details.line1,
    details.unitOrComplex,
    details.suburb,
    details.city,
    details.province,
    details.postalCode,
  ].map((part) => part.trim()).filter(Boolean).join(', ');
}

export function closePinRegion(coordinates: Coordinates): MapRegion {
  return Object.freeze({
    ...coordinates,
    latitudeDelta: 0.008,
    longitudeDelta: 0.008,
  });
}

export function isCandidateRevisionCurrent(
  capturedRevision: number,
  currentRevision: number,
): boolean {
  return Number.isSafeInteger(capturedRevision)
    && capturedRevision >= 0
    && capturedRevision === currentRevision;
}
