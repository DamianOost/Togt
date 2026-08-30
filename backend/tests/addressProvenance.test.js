const {
  normalizeCoordinatePair,
  normalizeCoordinateSource,
  normalizeAddressEvidence,
} = require('../src/lib/addressProvenance');

describe('shared address coordinate and provenance contract', () => {
  test('normalizes finite in-range coordinates once for every writer', () => {
    expect(normalizeCoordinatePair('-33.9618', '18.4732')).toEqual({
      latitude: -33.9618,
      longitude: 18.4732,
    });
    expect(() => normalizeCoordinatePair(null, 18.47)).toThrow('Address coordinates are invalid');
    expect(() => normalizeCoordinatePair(true, 18.47)).toThrow('Address coordinates are invalid');
    expect(() => normalizeCoordinatePair(Number.NaN, 18.47)).toThrow('Address coordinates are invalid');
    expect(() => normalizeCoordinatePair(-91, 18.47)).toThrow('Address coordinates are invalid');
    expect(() => normalizeCoordinatePair(-33.96, 181)).toThrow('Address coordinates are invalid');
  });

  test('permits official map-pin attestation only on the canonical quote surface', () => {
    expect(normalizeCoordinateSource('map_pin', { surface: 'canonical_quote' })).toBe('map_pin');
    expect(() => normalizeCoordinateSource('map_pin', { surface: 'legacy_audit' }))
      .toThrow('Coordinate provenance is not permitted on this route');
    expect(() => normalizeCoordinateSource('map_pin', { surface: 'mcp' }))
      .toThrow('Coordinate provenance is not permitted on this route');
  });

  test('keeps legacy NULL explicit, allows unsafe audit sources and rejects reserved assertions', () => {
    expect(normalizeCoordinateSource(undefined, { surface: 'legacy_audit' })).toBeNull();
    expect(normalizeCoordinateSource('device_gps', { surface: 'legacy_audit' })).toBe('device_gps');
    expect(normalizeCoordinateSource('entered_coordinates', { surface: 'legacy_audit' }))
      .toBe('entered_coordinates');
    expect(() => normalizeCoordinateSource('saved_verified_place', { surface: 'canonical_quote' }))
      .toThrow('Coordinate provenance is server reserved');
    expect(() => normalizeCoordinateSource('provider_geocode', { surface: 'legacy_audit' }))
      .toThrow('Coordinate provenance is server reserved');
    expect(() => normalizeCoordinateSource('invented', { surface: 'canonical_quote' }))
      .toThrow('Coordinate provenance is invalid');
  });

  test('normalizes coordinate and provenance as one evidence unit', () => {
    expect(normalizeAddressEvidence({
      latitude: -33.96,
      longitude: 18.47,
      coordinateSource: 'map_pin',
    }, { surface: 'canonical_quote' })).toEqual({
      latitude: -33.96,
      longitude: 18.47,
      coordinateSource: 'map_pin',
    });
  });
});
