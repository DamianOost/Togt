import type React from 'react';
import type NativeMapView from 'react-native-maps';
import type {
  MapPressEvent,
  MapViewProps,
  MarkerDragStartEndEvent,
  MarkerProps,
  Region,
} from 'react-native-maps';

export type PackagedMapPressEvent = MapPressEvent;
export type PackagedMarkerDragEndEvent = MarkerDragStartEndEvent;
export type PackagedMapRegion = Region;
export type PackagedMapRef = NativeMapView;

export type PackagedMapViewProps = React.PropsWithChildren<MapViewProps & Readonly<{
  unavailableDetail?: string;
}>>;

declare const PackagedMapView: React.ForwardRefExoticComponent<
  React.PropsWithoutRef<PackagedMapViewProps> & React.RefAttributes<NativeMapView>
>;

export const Marker: React.ComponentType<MarkerProps>;
export default PackagedMapView;
