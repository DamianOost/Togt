import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useTogtTheme } from '../../design';
import {
  AppScaffold,
  PrimaryButton,
  SecondaryButton,
  Surface,
  TertiaryButton,
} from '../../ui';
import { translateEnZa as t } from '../../i18n/en-ZA';
import { AuthIntro } from './AuthLayout';

export default function OnboardingScreen({ navigation }) {
  const theme = useTogtTheme();

  return (
    <AppScaffold
      contentContainerStyle={{
        justifyContent: 'center',
        paddingBottom: theme.spacing.xxl,
        paddingTop: theme.spacing.xxl,
      }}
      scrollable
      testID="auth-welcome-screen"
    >
      <AuthIntro
        body={t('auth.welcomeBody')}
        eyebrow={t('auth.welcomeKicker')}
        title={t('auth.welcomeTitle')}
      />

      <Surface
        accessibilityLabel={t('auth.welcomeBody')}
        elevation="card"
        style={{ marginTop: theme.spacing.xl, padding: theme.spacing.lg }}
        variant="inverse"
      >
        <View importantForAccessibility="no-hide-descendants" style={styles.journeyGraphic}>
          {['text-box-outline', 'account-search-outline', 'check-circle-outline'].map((icon, index) => (
            <React.Fragment key={icon}>
              <View
                style={[
                  styles.journeyNode,
                  {
                    borderColor: theme.colors.textInverse,
                    borderRadius: theme.radius.pill,
                    borderWidth: theme.border.thin,
                    height: theme.sizing.controlHeightLarge,
                    width: theme.sizing.controlHeightLarge,
                  },
                ]}
              >
                <MaterialCommunityIcons
                  color={theme.colors.textInverse}
                  name={icon}
                  size={theme.sizing.iconLarge}
                />
              </View>
              {index < 2 ? (
                <View
                  style={[
                    styles.journeyLine,
                    {
                      backgroundColor: theme.colors.actionPrimary,
                      height: theme.border.strong,
                      marginHorizontal: theme.spacing.xs,
                    },
                  ]}
                />
              ) : null}
            </React.Fragment>
          ))}
        </View>
      </Surface>

      <View style={{ marginTop: theme.spacing.xl, rowGap: theme.spacing.sm }}>
        <PrimaryButton
          accessibilityHint={t('auth.createCustomerHint')}
          fullWidth
          label={t('auth.needWorkDone')}
          large
          leading={(
            <MaterialCommunityIcons
              color={theme.colors.textInverse}
              name="hammer-wrench"
              size={theme.sizing.iconMedium}
            />
          )}
          onPress={() => navigation.navigate('Register', { role: 'customer' })}
          testID="create-customer-account"
        />
        <SecondaryButton
          accessibilityHint={t('auth.createWorkerHint')}
          fullWidth
          label={t('auth.offerServices')}
          large
          leading={(
            <MaterialCommunityIcons
              color={theme.colors.text}
              name="briefcase-outline"
              size={theme.sizing.iconMedium}
            />
          )}
          onPress={() => navigation.navigate('Register', { role: 'labourer' })}
          testID="create-worker-account"
        />
      </View>

      <View style={[styles.returning, { marginTop: theme.spacing.md }]}>
        <Text allowFontScaling style={[theme.typography.bodySmall, { color: theme.colors.textSecondary }]}>
          {t('auth.returning')}
        </Text>
        <TertiaryButton
          label={t('auth.signIn')}
          onPress={() => navigation.navigate('Login')}
        />
      </View>
    </AppScaffold>
  );
}

const styles = StyleSheet.create({
  journeyGraphic: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  journeyLine: {
    flex: 1,
  },
  journeyNode: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  returning: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
});
