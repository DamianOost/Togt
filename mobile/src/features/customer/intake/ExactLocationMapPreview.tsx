import React from 'react';
import { StyleSheet } from 'react-native';
import PackagedMapView, { Marker } from '../../../components/PackagedMapView';
import { GROUNDED_LIGHT_MAP_STYLE } from '../../../config/groundedMapStyle';
import { useTogtTheme } from '../../../design';
import type { Coordinates } from './model';
import { closePinRegion } from './pinPickerPresentation';

export type ExactLocationMapPreviewProps = Readonly<{
  coordinates: Coordinates;
}>;

export function ExactLocationMapPreview({ coordinates }: ExactLocationMapPreviewProps) {
  const theme = useTogtTheme();
  return (
    <PackagedMapView
      accessibilityElementsHidden
      customMapStyle={[...GROUNDED_LIGHT_MAP_STYLE]}
      region={closePinRegion(coordinates)}
      importantForAccessibility="no-hide-descendants"
      pitchEnabled={false}
      pointerEvents="none"
      rotateEnabled={false}
      scrollEnabled={false}
      showsBuildings={false}
      showsCompass={false}
      showsIndoorLevelPicker={false}
      showsMyLocationButton={false}
      showsPointsOfInterest={false}
      style={styles.map}
      toolbarEnabled={false}
      zoomEnabled={false}
    >
      <Marker coordinate={coordinates} pinColor={theme.colors.actionPrimary} />
    </PackagedMapView>
  );
}

const styles = StyleSheet.create({
  map: {
    height: 176,
    width: '100%',
  },
});

export default ExactLocationMapPreview;
