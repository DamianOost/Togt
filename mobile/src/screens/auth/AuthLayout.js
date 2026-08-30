import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';

import { useTogtTheme } from '../../design';
import { BrandMark, Surface } from '../../ui';

export function AuthIntro({ eyebrow, title, body, compact = false }) {
  const theme = useTogtTheme();

  return (
    <View style={styles.intro}>
      <BrandMark showDescriptor={!compact} />
      {eyebrow ? (
        <Text
          allowFontScaling
          style={[
            theme.typography.label,
            {
              color: theme.colors.actionPrimaryPressed,
              marginTop: theme.spacing.xl,
            },
          ]}
        >
          {eyebrow}
        </Text>
      ) : null}
      <Text
        accessibilityRole="header"
        allowFontScaling
        style={[
          compact ? theme.typography.h1 : theme.typography.display,
          {
            color: theme.colors.text,
            marginTop: eyebrow ? theme.spacing.xs : theme.spacing.xl,
          },
        ]}
      >
        {title}
      </Text>
      <Text
        allowFontScaling
        style={[
          theme.typography.body,
          {
            color: theme.colors.textSecondary,
            marginTop: theme.spacing.sm,
          },
        ]}
      >
        {body}
      </Text>
    </View>
  );
}

export function AuthFormSurface({ children, testID }) {
  const theme = useTogtTheme();

  return (
    <Surface
      elevation="card"
      style={{ marginTop: theme.spacing.xl, padding: theme.spacing.lg }}
      testID={testID}
    >
      {children}
    </Surface>
  );
}

export function IconBadge({ name, tone = 'brand', size = 'large' }) {
  const theme = useTogtTheme();
  const isAttention = tone === 'attention';
  const foreground = isAttention
    ? theme.colors.textOnAttention
    : theme.colors.actionPrimaryPressed;
  const background = isAttention
    ? theme.colors.surfaceAttention
    : theme.colors.surfacePositive;
  const dimension = size === 'large'
    ? theme.sizing.controlHeightLarge
    : theme.sizing.touchTarget;

  return (
    <View
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.iconBadge,
        {
          backgroundColor: background,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.card,
          borderWidth: theme.border.thin,
          height: dimension,
          width: dimension,
        },
      ]}
    >
      <MaterialCommunityIcons
        color={foreground}
        name={name}
        size={size === 'large' ? theme.sizing.iconLarge : theme.sizing.iconMedium}
      />
    </View>
  );
}

export function ValuePoint({ icon, title, body }) {
  const theme = useTogtTheme();

  return (
    <View
      accessible
      accessibilityLabel={`${title}. ${body}`}
      style={[styles.valuePoint, { columnGap: theme.spacing.sm }]}
    >
      <IconBadge name={icon} size="compact" />
      <View style={styles.valueCopy}>
        <Text allowFontScaling style={[theme.typography.label, { color: theme.colors.text }]}>
          {title}
        </Text>
        <Text
          allowFontScaling
          style={[
            theme.typography.bodySmall,
            { color: theme.colors.textSecondary, marginTop: theme.spacing.xxs },
          ]}
        >
          {body}
        </Text>
      </View>
    </View>
  );
}

export function FieldSpacer({ size = 'md' }) {
  const theme = useTogtTheme();
  return <View importantForAccessibility="no" style={{ height: theme.spacing[size] }} />;
}

const styles = StyleSheet.create({
  intro: {
    alignSelf: 'stretch',
  },
  iconBadge: {
    alignItems: 'center',
    flexShrink: 0,
    justifyContent: 'center',
  },
  valuePoint: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  valueCopy: {
    flex: 1,
  },
});
