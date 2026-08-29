import React from 'react';
import type { PropsWithChildren, ReactNode } from 'react';
import type { ScrollViewProps, StyleProp, ViewStyle } from 'react-native';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLayoutMetrics, useTogtTheme } from '../design';

type SafeAreaInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type AppScaffoldProps = PropsWithChildren<{
  topBar?: ReactNode;
  bottomAction?: ReactNode;
  scrollable?: boolean;
  keyboardAware?: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  safeAreaInsets?: Partial<SafeAreaInsets>;
  keyboardShouldPersistTaps?: ScrollViewProps['keyboardShouldPersistTaps'];
  testID?: string;
}>;

export function AppScaffold({
  children,
  topBar,
  bottomAction,
  scrollable = false,
  keyboardAware = false,
  contentContainerStyle,
  safeAreaInsets,
  keyboardShouldPersistTaps = 'handled',
  testID,
}: AppScaffoldProps) {
  const theme = useTogtTheme();
  const layout = useLayoutMetrics();
  const contentStyle = [
    styles.content,
    {
      maxWidth: layout.contentMaxWidth,
      paddingHorizontal: layout.horizontalPadding,
    },
    contentContainerStyle,
  ];

  const content = scrollable ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={contentStyle}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, contentStyle]}>{children}</View>
  );

  const frame = (
    <>
      <StatusBar
        animated
        backgroundColor={theme.colors.canvas}
        barStyle="dark-content"
      />
      <KeyboardAvoidingView
        behavior={keyboardAware && Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={keyboardAware}
        style={styles.flex}
      >
        {topBar}
        <View style={styles.flex}>{content}</View>
        {bottomAction ? (
          <View
            style={[
              styles.bottomAction,
              {
                backgroundColor: theme.colors.surface,
                borderTopColor: theme.colors.border,
                borderTopWidth: theme.border.thin,
                paddingHorizontal: layout.horizontalPadding,
                paddingBottom: theme.spacing.md,
                paddingTop: theme.spacing.sm,
              },
            ]}
          >
            {bottomAction}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </>
  );

  if (safeAreaInsets) {
    return (
      <View
        style={[
          styles.safeArea,
          {
            backgroundColor: theme.colors.canvas,
            paddingBottom: safeAreaInsets.bottom,
            paddingLeft: safeAreaInsets.left,
            paddingRight: safeAreaInsets.right,
            paddingTop: safeAreaInsets.top,
          },
        ]}
        testID={testID}
      >
        {frame}
      </View>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.colors.canvas }]}
      testID={testID}
    >
      {frame}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    alignSelf: 'center',
    width: '100%',
  },
  bottomAction: {},
});

export default AppScaffold;
