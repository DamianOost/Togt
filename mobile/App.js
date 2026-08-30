import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Provider, useSelector, useDispatch } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold';
import { Manrope_800ExtraBold } from '@expo-google-fonts/manrope/800ExtraBold';
import store from './src/store/store';
import AppNavigator from './src/navigation/AppNavigator';
import { setAuthHandlers } from './src/services/api';
import { lightTheme, TogtThemeProvider, useTogtTheme } from './src/design';
import { AppScaffold, BrandMark, Button, Surface } from './src/ui';
import { translateEnZa as t } from './src/i18n/en-ZA';
import {
  RESTORE_STATUS,
  restoreSessionThunk,
  logoutThunk,
  refreshTokensThunk,
} from './src/store/authSlice';

const systemFallbackTheme = {
  ...lightTheme,
  typography: Object.fromEntries(
    Object.entries(lightTheme.typography).map(([name, style]) => {
      const { fontFamily: _fontFamily, ...systemStyle } = style;
      return [name, systemStyle];
    })
  ),
};

// Wire api.js into Redux + SecureStore.
function AuthWirer() {
  useEffect(() => {
    setAuthHandlers({
      getAccessToken: () => store.getState().auth.accessToken,
      refreshAndStore: async () => store.dispatch(refreshTokensThunk()).unwrap(),
      onLogout: () => store.dispatch(logoutThunk()),
    });
  }, []);
  return null;
}

function RestoreProgress() {
  const theme = useTogtTheme();

  return (
    <AppScaffold
      contentContainerStyle={styles.startup}
      testID="session-restore-progress"
    >
      <View accessibilityLiveRegion="polite" style={styles.centeredContent}>
        <BrandMark showDescriptor />
        <ActivityIndicator
          accessibilityLabel={t('auth.restoringSession')}
          color={theme.colors.actionPrimary}
          size="small"
          style={{ marginTop: theme.spacing.xxl }}
        />
        <Text
          allowFontScaling
          style={[
            theme.typography.bodySmall,
            { color: theme.colors.textSecondary, marginTop: theme.spacing.sm },
          ]}
        >
          {t('auth.restoringSession')}
        </Text>
      </View>
    </AppScaffold>
  );
}

function RestoreIssue({ issue, hasStoredSession, onRetry, onSignIn }) {
  const theme = useTogtTheme();

  return (
    <AppScaffold contentContainerStyle={styles.startup} testID="session-restore-issue">
      <Surface
        accessibilityLabel={issue?.title || 'Session unavailable'}
        elevation="card"
        style={{ padding: theme.spacing.xl }}
      >
        <View
          importantForAccessibility="no"
          style={[
            styles.issueAccent,
            {
              backgroundColor: theme.colors.actionPrimary,
              borderRadius: theme.radius.pill,
              height: theme.border.strong + theme.border.strong,
              marginBottom: theme.spacing.xl,
              width: theme.spacing.xxxl,
            },
          ]}
        />
        <Text
          allowFontScaling
          style={[theme.typography.label, { color: theme.colors.actionPrimary }]}
        >
          {hasStoredSession ? t('auth.savedSessionLocked') : t('auth.startupCheck')}
        </Text>
        <Text
          accessibilityLiveRegion="assertive"
          accessibilityRole="header"
          allowFontScaling
          style={[
            theme.typography.h1,
            { color: theme.colors.text, marginTop: theme.spacing.xs },
          ]}
        >
          {issue?.title || t('auth.sessionUnavailable')}
        </Text>
        <Text
          allowFontScaling
          style={[
            theme.typography.body,
            {
              color: theme.colors.textSecondary,
              marginBottom: theme.spacing.xl,
              marginTop: theme.spacing.sm,
            },
          ]}
        >
          {issue?.detail || t('auth.sessionUnavailableBody')}
        </Text>
        <Button
          fullWidth
          label={t('common.retry')}
          onPress={onRetry}
          accessibilityHint={t('auth.trySessionAgainHint')}
        />
        <Button
          fullWidth
          label={t('auth.returnSignIn')}
          onPress={onSignIn}
          accessibilityHint={t('auth.returnSignInHint')}
          style={{ marginTop: theme.spacing.sm }}
          variant="secondary"
        />
      </Surface>
    </AppScaffold>
  );
}

// Restore auth session from device storage, but do not render a role shell
// until the server has resolved the current identity and role.
function SessionRestorer({ children }) {
  const dispatch = useDispatch();
  const {
    restored,
    restoreStatus,
    restoreIssue,
    hasStoredSession,
  } = useSelector((state) => state.auth);

  useEffect(() => {
    dispatch(restoreSessionThunk());
  }, [dispatch]);

  if (!restored || [RESTORE_STATUS.IDLE, RESTORE_STATUS.RESTORING].includes(restoreStatus)) {
    return <RestoreProgress />;
  }

  if ([RESTORE_STATUS.OFFLINE, RESTORE_STATUS.ERROR].includes(restoreStatus)) {
    return (
      <RestoreIssue
        issue={restoreIssue}
        hasStoredSession={hasStoredSession}
        onRetry={() => dispatch(restoreSessionThunk())}
        onSignIn={() => dispatch(logoutThunk())}
      />
    );
  }

  return children;
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  if (!fontsLoaded && !fontError) {
    return (
      <View
        accessibilityLabel="Loading TOGT"
        accessibilityRole="progressbar"
        style={[styles.fontGate, { backgroundColor: lightTheme.colors.canvas }]}
      >
        <ActivityIndicator color={lightTheme.colors.actionPrimary} size="small" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <TogtThemeProvider theme={fontError ? systemFallbackTheme : lightTheme}>
        <Provider store={store}>
          <AuthWirer />
          <SessionRestorer>
            <AppNavigator />
          </SessionRestorer>
        </Provider>
      </TogtThemeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  startup: {
    flex: 1,
    justifyContent: 'center',
  },
  centeredContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  issueAccent: {
    alignSelf: 'flex-start',
  },
  fontGate: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
});
