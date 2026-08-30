import React from 'react';
import type { ComponentProps } from 'react';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

export type GroundedTabIconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

export type GroundedTabIconProps = {
  color: string;
  focused: boolean;
  name: GroundedTabIconName;
  size: number;
};

export function GroundedTabIcon({ color, focused, name, size }: GroundedTabIconProps) {
  return (
    <MaterialCommunityIcons
      accessibilityElementsHidden
      color={color}
      importantForAccessibility="no-hide-descendants"
      name={name}
      size={focused ? size + 1 : size}
    />
  );
}

export default GroundedTabIcon;
