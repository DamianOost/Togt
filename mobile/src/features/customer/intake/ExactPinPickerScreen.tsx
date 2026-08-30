import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  AppState,
  findNodeHandle,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import PackagedMapView, { Marker } from '../../../components/PackagedMapView';
import type {
  PackagedMapPressEvent,
  PackagedMapRef,
  PackagedMapRegion,
  PackagedMarkerDragEndEvent,
} from '../../../components/PackagedMapView';
import { GROUNDED_LIGHT_MAP_STYLE } from '../../../config/groundedMapStyle';
import { useTogtTheme } from '../../../design';
import { AppScaffold, Button, Surface, TopAppBar } from '../../../ui';
import { IntakeIcon } from './components';
import type { CapabilityState, Coordinates } from './model';
import {
  SOUTH_AFRICA_OVERVIEW_REGION,
  closePinRegion,
  isCandidateRevisionCurrent,
} from './pinPickerPresentation';

export type ForegroundLocationResult =
  | Readonly<{
      ok: true;
      coordinates: Coordinates;
      permission: 'granted_precise' | 'granted_approximate';
    }>
  | Readonly<{
      ok: false;
      reasonCode: 'location_permission_denied' | 'location_permission_blocked' | 'location_unavailable';
      explanation: string;
    }>;

export type PinPickerCommitResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reasonCode: string; explanation: string }>;

export type RefreshedMapCapability = Readonly<{
  capability: CapabilityState;
  expiresAt: string | null;
  currentLocationCapability?: CapabilityState;
}>;

export type ExactPinPickerScreenProps = Readonly<{
  addressLabel: string;
  initialCoordinate: Coordinates | null;
  initialMapCapability: CapabilityState;
  initialMapCapabilityExpiresAt: string | null;
  currentLocationCapability: CapabilityState;
  onCancel: () => void;
  onCommitSuccess: () => void;
  onRefreshMapCapability: () => Promise<RefreshedMapCapability>;
  onRequestCurrentLocation: () => Promise<ForegroundLocationResult>;
  onUsePin: (coordinates: Coordinates) => Promise<PinPickerCommitResult>;
}>;

function capabilityError(capability: CapabilityState): string | null {
  return capability.status === 'available' ? null : capability.explanation;
}

function initialMapEvidence(
  capability: CapabilityState,
  expiresAt: string | null,
): CapabilityState {
  if (capability.status !== 'available') return capability;
  const expiresMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  if (Number.isFinite(expiresMs) && Date.now() < expiresMs) return capability;
  return Object.freeze({
    status: 'unavailable',
    reasonCode: 'capability_data_expired',
    explanation: 'Map availability expired. Refresh to continue; your address and candidate pin are kept.',
  });
}

export function ExactPinPickerScreen({
  addressLabel,
  initialCoordinate,
  initialMapCapability,
  initialMapCapabilityExpiresAt,
  currentLocationCapability,
  onCancel,
  onCommitSuccess,
  onRefreshMapCapability,
  onRequestCurrentLocation,
  onUsePin,
}: ExactPinPickerScreenProps) {
  const theme = useTogtTheme();
  const initialEffectiveMapCapability = initialMapEvidence(
    initialMapCapability,
    initialMapCapabilityExpiresAt,
  );
  const mapRef = useRef<PackagedMapRef | null>(null);
  const errorRef = useRef<Text | null>(null);
  const active = useRef(true);
  const commitInFlight = useRef(false);
  const candidateRef = useRef<Coordinates | null>(initialCoordinate);
  const candidateRevision = useRef(0);
  const [mapCapability, setMapCapability] = useState(initialEffectiveMapCapability);
  const [mapCapabilityExpiresAt, setMapCapabilityExpiresAt] = useState(initialMapCapabilityExpiresAt);
  const [locationCapability, setLocationCapability] = useState(currentLocationCapability);
  const [candidate, setCandidate] = useState<Coordinates | null>(initialCoordinate);
  const [visibleRegion, setVisibleRegion] = useState<PackagedMapRegion>(
    initialCoordinate ? closePinRegion(initialCoordinate) : SOUTH_AFRICA_OVERVIEW_REGION,
  );
  const [mapReady, setMapReady] = useState(false);
  const [locating, setLocating] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [permission, setPermission] = useState<'unknown' | 'granted_precise' | 'granted_approximate' | 'denied'>('unknown');
  const [problem, setProblem] = useState<string | null>(capabilityError(initialEffectiveMapCapability));

  useEffect(() => () => {
    active.current = false;
  }, []);

  const focusProblem = useCallback(() => {
    const node = findNodeHandle(errorRef.current);
    if (node !== null) AccessibilityInfo.setAccessibilityFocus(node);
  }, []);

  const reportProblem = useCallback((message: string) => {
    if (!active.current) return;
    setProblem(message);
    requestAnimationFrame(focusProblem);
  }, [focusProblem]);

  const refreshCapability = useCallback(async (): Promise<RefreshedMapCapability> => {
    try {
      const refreshed = await onRefreshMapCapability();
      if (!active.current) {
        const closed: RefreshedMapCapability = Object.freeze({
          capability: {
            status: 'unavailable' as const,
            reasonCode: 'pin_picker_closed',
            explanation: 'The pin picker was closed. Your address and pin were not changed.',
          },
          expiresAt: null,
        });
        return closed;
      }
      const effectiveCapability = initialMapEvidence(refreshed.capability, refreshed.expiresAt);
      const effectiveRefresh: RefreshedMapCapability = Object.freeze({
        ...refreshed,
        capability: effectiveCapability,
      });
      setMapCapability(effectiveCapability);
      setMapCapabilityExpiresAt(refreshed.expiresAt);
      if (effectiveCapability.status !== 'available') setMapReady(false);
      if (refreshed.currentLocationCapability) setLocationCapability(refreshed.currentLocationCapability);
      const nextProblem = capabilityError(effectiveCapability);
      setProblem(nextProblem);
      return effectiveRefresh;
    } catch {
      const unavailable: RefreshedMapCapability = {
        capability: {
          status: 'unavailable',
          reasonCode: 'capability_data_unavailable',
          explanation: 'The map permission could not be refreshed. Your address and pin have been kept.',
        },
        expiresAt: null,
      };
      if (!active.current) return unavailable;
      setMapCapability(unavailable.capability);
      setMapCapabilityExpiresAt(null);
      setMapReady(false);
      setProblem(unavailable.capability.explanation);
      return unavailable;
    }
  }, [onRefreshMapCapability]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshCapability();
    });
    return () => subscription.remove();
  }, [refreshCapability]);

  useEffect(() => {
    if (!mapCapabilityExpiresAt) return undefined;
    const delay = Math.max(0, Date.parse(mapCapabilityExpiresAt) - Date.now());
    const timer = setTimeout(() => { void refreshCapability(); }, Math.min(delay, 2_147_000_000));
    return () => clearTimeout(timer);
  }, [mapCapabilityExpiresAt, refreshCapability]);

  const positionCandidate = useCallback((coordinates: Coordinates, announcement: string) => {
    if (commitInFlight.current) return;
    candidateRef.current = coordinates;
    candidateRevision.current += 1;
    setCandidate(coordinates);
    setVisibleRegion((current) => ({
      ...current,
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
    }));
    setProblem(null);
    AccessibilityInfo.announceForAccessibility(announcement);
  }, []);

  const centreOnLocation = async () => {
    if (!mapReady || locating || committing || locationCapability.status !== 'available') return;
    setLocating(true);
    setProblem(null);
    let result: ForegroundLocationResult;
    try {
      result = await onRequestCurrentLocation();
    } catch {
      if (!active.current) return;
      setLocating(false);
      reportProblem('The device could not provide a current position. Move the map and place the pin manually.');
      return;
    }
    if (!active.current) return;
    setLocating(false);
    if (!result.ok) {
      setPermission('denied');
      reportProblem(result.explanation);
      return;
    }
    setPermission(result.permission);
    positionCandidate(
      result.coordinates,
      result.permission === 'granted_approximate'
        ? 'Approximate location found. Review the pin position, then use this pin.'
        : 'Current location found. Review the pin position, then use this pin.',
    );
    mapRef.current?.animateToRegion(closePinRegion(result.coordinates), theme.motion.duration.standard);
  };

  const usePin = async () => {
    const candidateAtStart = candidateRef.current;
    if (!candidateAtStart || !mapReady || commitInFlight.current) return;
    const candidateRevisionAtStart = candidateRevision.current;
    commitInFlight.current = true;
    setCommitting(true);
    setProblem(null);
    const refreshed = await refreshCapability();
    if (!active.current) return;
    if (refreshed.capability.status !== 'available') {
      commitInFlight.current = false;
      setCommitting(false);
      reportProblem(refreshed.capability.explanation);
      return;
    }
    if (!isCandidateRevisionCurrent(candidateRevisionAtStart, candidateRevision.current)) {
      commitInFlight.current = false;
      setCommitting(false);
      reportProblem('The pin moved while it was being checked. Review the new position and try again.');
      return;
    }
    let result: PinPickerCommitResult;
    try {
      result = await onUsePin(candidateAtStart);
    } catch {
      if (!active.current) return;
      commitInFlight.current = false;
      setCommitting(false);
      reportProblem('The pin could not be saved. Review the position and try again.');
      return;
    }
    if (!active.current) return;
    commitInFlight.current = false;
    setCommitting(false);
    if (!result.ok) {
      reportProblem(result.explanation);
      return;
    }
    AccessibilityInfo.announceForAccessibility('Exact job pin saved.');
    onCommitSuccess();
  };

  const mapAvailable = mapCapability.status === 'available';
  const status = candidate
    ? 'Pin positioned. Check that it matches the address below.'
    : 'Move the map, then tap it or choose Place pin at map centre.';

  return (
    <AppScaffold
      bottomAction={(
        <View style={{ rowGap: theme.spacing.sm }}>
          <ScrollView
            accessibilityLabel="Address being paired with this pin"
            contentContainerStyle={{ rowGap: theme.spacing.xxs }}
            style={{ maxHeight: theme.sizing.multilineFieldMinHeight }}
          >
            <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>PIN FOR</Text>
            <Text allowFontScaling style={[theme.typography.h3, { color: theme.colors.text }]}>{addressLabel}</Text>
            <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>{status}</Text>
            {permission === 'granted_approximate' ? (
              <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
                Your device supplied an approximate starting point. The pin becomes exact only where you place and accept it.
              </Text>
            ) : null}
            {problem ? (
              <Text
                accessibilityLiveRegion="assertive"
                allowFontScaling
                ref={errorRef}
                style={[theme.typography.bodySmall, { color: theme.colors.error }]}
                testID="exact-pin-problem"
              >
                {problem}
              </Text>
            ) : null}
          </ScrollView>
          <View style={{ rowGap: theme.spacing.xs }}>
            <Button
              accessibilityHint="Sets the candidate to the visible centre of the map without confirming it."
              disabled={!mapAvailable || !mapReady || committing}
              fullWidth
              label="Place pin at map centre"
              leading={<IntakeIcon name="crosshairs" tone="primary" />}
              onPress={() => positionCandidate({
                latitude: visibleRegion.latitude,
                longitude: visibleRegion.longitude,
              }, 'Pin positioned at the map centre. Review it, then use this pin.')}
              testID="place-pin-at-map-centre"
              variant="secondary"
            />
            {locationCapability.status === 'available' ? (
              <Button
                accessibilityHint="Requests foreground location permission, then centres the map. It does not confirm the address."
                disabled={!mapAvailable || !mapReady || committing}
                fullWidth
                label="Centre on my location"
                leading={<IntakeIcon name="crosshairs-gps" tone="primary" />}
                loading={locating}
                onPress={() => { void centreOnLocation(); }}
                testID="centre-on-current-location"
                variant="tertiary"
              />
            ) : (
              <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.textSecondary }]}>
                {locationCapability.explanation} You can still place the pin manually.
              </Text>
            )}
            <Button
              accessibilityHint={candidate ? 'Binds this pin to the displayed address.' : 'Place a pin before continuing.'}
              disabled={!candidate || !mapAvailable || !mapReady || locating}
              fullWidth
              label="Use this pin"
              large
              loading={committing}
              onPress={() => { void usePin(); }}
              testID="use-this-pin"
            />
          </View>
        </View>
      )}
      contentContainerStyle={styles.edgeToEdge}
      testID="exact-pin-picker-screen"
      topBar={<TopAppBar backLabel="Cancel" onBack={() => {
        active.current = false;
        onCancel();
      }} title="Set exact pin" />}
    >
      {mapAvailable ? (
        <View style={styles.mapStage}>
          <PackagedMapView
            ref={mapRef}
            customMapStyle={[...GROUNDED_LIGHT_MAP_STYLE]}
            initialRegion={visibleRegion}
            onMapReady={() => {
              mapRef.current?.animateToRegion(
                candidate ? closePinRegion(candidate) : visibleRegion,
                0,
              );
              requestAnimationFrame(() => {
                if (active.current) setMapReady(true);
              });
            }}
            onPress={(event: PackagedMapPressEvent) => positionCandidate(
              event.nativeEvent.coordinate,
              'Pin positioned. Review the address, then use this pin.',
            )}
            onRegionChangeComplete={(region: PackagedMapRegion) => setVisibleRegion(region)}
            pitchEnabled={false}
            pointerEvents={committing ? 'none' : 'auto'}
            rotateEnabled={false}
            showsBuildings={false}
            showsCompass={false}
            showsIndoorLevelPicker={false}
            showsMyLocationButton={false}
            showsPointsOfInterest={false}
            showsUserLocation={permission === 'granted_precise' || permission === 'granted_approximate'}
            style={styles.map}
            toolbarEnabled={false}
          >
            {candidate ? (
              <Marker
                accessibilityLabel="Exact job pin. Drag to adjust."
                coordinate={candidate}
                draggable={!committing}
                onDragEnd={(event: PackagedMarkerDragEndEvent) => positionCandidate(
                  event.nativeEvent.coordinate,
                  'Pin moved. Review the address, then use this pin.',
                )}
                pinColor={theme.colors.actionPrimary}
              />
            ) : null}
          </PackagedMapView>
          <View importantForAccessibility="no-hide-descendants" pointerEvents="none" style={styles.centreTarget}>
            <View
              style={[
                styles.targetDisc,
                theme.elevation.floating,
                {
                  backgroundColor: theme.colors.translucentSurface,
                  borderColor: theme.colors.actionPrimary,
                  borderRadius: theme.radius.pill,
                  borderWidth: theme.border.strong,
                  height: theme.sizing.touchTarget,
                  width: theme.sizing.touchTarget,
                },
              ]}
            >
              <IntakeIcon name="crosshairs" />
            </View>
          </View>
          <Surface
            accessibilityLabel={mapReady ? 'Map ready' : 'Map loading'}
            elevation="floating"
            style={[
              styles.mapStatus,
              {
                backgroundColor: theme.colors.translucentSurface,
                columnGap: theme.spacing.xs,
                left: theme.spacing.md,
                padding: theme.spacing.xs,
                top: theme.spacing.md,
              },
            ]}
          >
            {mapReady ? <IntakeIcon name="map-check-outline" size={theme.sizing.iconSmall} /> : <ActivityIndicator color={theme.colors.actionPrimary} size="small" />}
            <Text allowFontScaling style={[theme.typography.caption, { color: theme.colors.text }]}>
              {mapReady ? 'Tap or drag to position' : 'Loading map'}
            </Text>
          </Surface>
        </View>
      ) : (
        <View style={[styles.unavailable, { padding: theme.spacing.xl, rowGap: theme.spacing.md }]}>
          <Surface elevation="card" variant="attention">
            <View style={{ alignItems: 'flex-start', rowGap: theme.spacing.sm }}>
              <IntakeIcon name="map-marker-off-outline" tone="attention" size={theme.sizing.iconLarge} />
              <Text accessibilityRole="header" allowFontScaling style={[theme.typography.h2, { color: theme.colors.text }]}>Map temporarily unavailable</Text>
              <Text allowFontScaling style={[theme.typography.body, { color: theme.colors.textSecondary }]}>{mapCapability.explanation}</Text>
              <Button label="Try again" onPress={() => { void refreshCapability(); }} variant="secondary" />
            </View>
          </Surface>
        </View>
      )}
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  edgeToEdge: {
    maxWidth: '100%',
    paddingHorizontal: 0,
  },
  mapStage: {
    flex: 1,
    overflow: 'hidden',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  centreTarget: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  targetDisc: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapStatus: {
    alignItems: 'center',
    flexDirection: 'row',
    position: 'absolute',
  },
  unavailable: {
    flex: 1,
    justifyContent: 'center',
  },
});

export default ExactPinPickerScreen;
