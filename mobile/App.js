import React, { useEffect } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { Provider, useSelector, useDispatch } from 'react-redux';
import { StatusBar } from 'expo-status-bar';
import store from './src/store/store';
import AppNavigator from './src/navigation/AppNavigator';
import { setAuthHandlers } from './src/services/api';
import {
  RESTORE_STATUS,
  restoreSessionThunk,
  logoutThunk,
  refreshTokensThunk,
} from './src/store/authSlice';

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
  return (
    <View style={styles.startup} accessibilityLiveRegion="polite">
      <StatusBar style="dark" backgroundColor="#F7F4EF" />
      <View style={styles.mark} accessible accessibilityRole="header">
        <Text style={styles.markText}>T</Text>
      </View>
      <Text style={styles.brand}>TOGT</Text>
      <ActivityIndicator
        size="small"
        color="#12844E"
        style={styles.progress}
        accessibilityLabel="Checking your saved session"
      />
      <Text style={styles.progressText}>Checking your saved session…</Text>
    </View>
  );
}

function RestoreIssue({ issue, hasStoredSession, onRetry, onSignIn }) {
  return (
    <View style={styles.startup}>
      <StatusBar style="dark" backgroundColor="#F7F4EF" />
      <View style={styles.issueCard} accessibilityLiveRegion="assertive">
        <View style={styles.issueAccent} />
        <Text style={styles.issueEyebrow}>
          {hasStoredSession ? 'SAVED SESSION LOCKED' : 'STARTUP CHECK'}
        </Text>
        <Text style={styles.issueTitle}>{issue?.title || 'Session unavailable'}</Text>
        <Text style={styles.issueDetail}>
          {issue?.detail || 'TOGT could not verify your session. Try again or return to sign in.'}
        </Text>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Try session check again"
        >
          <Text style={styles.primaryButtonText}>Try again</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={onSignIn}
          accessibilityRole="button"
          accessibilityLabel="Clear the saved session and return to sign in"
        >
          <Text style={styles.secondaryButtonText}>Return to sign in</Text>
        </TouchableOpacity>
      </View>
    </View>
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
  return (
    <Provider store={store}>
      <AuthWirer />
      <SessionRestorer>
        <AppNavigator />
      </SessionRestorer>
    </Provider>
  );
}

const styles = StyleSheet.create({
  startup: {
    flex: 1,
    backgroundColor: '#F7F4EF',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  mark: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#12844E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: {
    color: '#FFFFFF',
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '900',
  },
  brand: {
    marginTop: 12,
    color: '#0F1F1B',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    letterSpacing: 2,
  },
  progress: { marginTop: 28 },
  progressText: {
    marginTop: 12,
    color: '#4E5C57',
    fontSize: 14,
    lineHeight: 20,
  },
  issueCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D6DED9',
    borderRadius: 24,
    padding: 24,
    overflow: 'hidden',
  },
  issueAccent: {
    width: 40,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#12844E',
    marginBottom: 24,
  },
  issueEyebrow: {
    color: '#12844E',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  issueTitle: {
    marginTop: 8,
    color: '#0F1F1B',
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
  },
  issueDetail: {
    marginTop: 12,
    marginBottom: 24,
    color: '#4E5C57',
    fontSize: 16,
    lineHeight: 24,
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: '#12844E',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700',
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D6DED9',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginTop: 12,
  },
  secondaryButtonText: {
    color: '#0F1F1B',
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '700',
  },
});
