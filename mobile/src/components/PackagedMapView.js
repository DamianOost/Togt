import React, { forwardRef } from 'react';
import NativeMapView, { Marker as NativeMarker } from 'react-native-maps';
import MapUnavailableState from './MapUnavailableState';
import { MAPS_AVAILABLE } from '../config/providerConfig';

const PackagedMapView = forwardRef(function PackagedMapView(
  { children, unavailableDetail, style, ...mapProps },
  ref
) {
  if (!MAPS_AVAILABLE) {
    return <MapUnavailableState detail={unavailableDetail} style={style} />;
  }

  return (
    <NativeMapView ref={ref} style={style} {...mapProps}>
      {children}
    </NativeMapView>
  );
});

export const Marker = NativeMarker;
export default PackagedMapView;
