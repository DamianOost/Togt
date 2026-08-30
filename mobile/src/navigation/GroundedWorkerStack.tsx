import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTogtTheme } from '../design';
import {
  WorkerAccountReadinessRoute,
  WorkerActivationRoute,
  WorkerActiveWorkRoute,
  WorkerCompletionRoute,
  WorkerJobDetailRoute,
  WorkerIncomingOfferRoute,
  WorkerJobsRoute,
  WorkerEarningsRoute,
  WorkerServiceCatalogueRoute,
  WorkerServicesProfileRoute,
  WorkerScopeStartRoute,
  WorkerTodayRoute,
  WorkerQuoteBuilderRoute,
  WorkerQuoteRequestDetailRoute,
  WorkerQuoteRequestsRoute,
} from '../features/worker/integration';
import {
  IncidentDetailRoute,
  IncidentReportRoute,
  NotificationControlsRoute,
  RecurringOccurrenceRoute,
  RecurringProposalRoute,
  RecurringSeriesRoute,
  SafeSharingRoute,
  SafetyCentreRoute,
  SafetyHelpRoute,
  TrustFairnessRoute,
} from '../features/trust/integration';
import { ProjectLiveStatusRoute } from '../features/intelligence/integration';
import { ProjectRescheduleRoute } from '../features/fulfilment/integration';
import { GroundedProjectChatRoute } from '../features/customer/integration';
import ActiveJobScreen from '../screens/labourer/ActiveJobScreen';
import KYCScreen from '../screens/shared/KYCScreen';
import ScopeConfirmScreen from '../screens/shared/ScopeConfirmScreen';
import GroundedTabIcon from './GroundedTabIcon';
import { resolveGroundedTabBarLayout } from './groundedTabBarLayout';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function WorkerTabs() {
  const theme = useTogtTheme();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const tabBarLayout = resolveGroundedTabBarLayout({
    bottomInset: insets.bottom,
    fontScale,
    labelLineHeight: theme.typography.caption.lineHeight as number,
    minimumBottomPadding: theme.spacing.xs,
    minimumHeight: theme.sizing.touchTarget + theme.spacing.md,
    topPadding: theme.spacing.xs,
  });

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.actionPrimary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarHideOnKeyboard: true,
        tabBarAllowFontScaling: true,
        tabBarLabelStyle: theme.typography.caption,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          height: tabBarLayout.height,
          paddingBottom: tabBarLayout.paddingBottom,
          paddingTop: tabBarLayout.paddingTop,
        },
        tabBarIcon: ({ color, focused, size }) => {
          const icon = route.name === 'Today'
            ? 'weather-sunny'
            : route.name === 'Jobs'
              ? 'briefcase-outline'
              : route.name === 'Earnings'
                ? 'wallet-outline'
                : 'account-circle-outline';
          return <GroundedTabIcon color={color} focused={focused} name={icon} size={size} />;
        },
      })}
    >
      <Tab.Screen name="Today" component={WorkerTodayRoute} />
      <Tab.Screen name="Jobs" component={WorkerJobsRoute} />
      <Tab.Screen name="Earnings" component={WorkerEarningsRoute} />
      <Tab.Screen name="Account" component={WorkerAccountReadinessRoute} />
    </Tab.Navigator>
  );
}

export default function GroundedWorkerStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="WorkerTabs" component={WorkerTabs} />
      <Stack.Screen name="WorkerJobDetail" component={WorkerJobDetailRoute} />
      <Stack.Screen name="SafeSharing" component={SafeSharingRoute} />
      <Stack.Screen name="WorkerIncomingOffer" component={WorkerIncomingOfferRoute} />
      <Stack.Screen name="WorkerQuoteRequests" component={WorkerQuoteRequestsRoute} />
      <Stack.Screen name="WorkerQuoteRequestDetail" component={WorkerQuoteRequestDetailRoute} />
      <Stack.Screen name="WorkerQuoteBuilder" component={WorkerQuoteBuilderRoute} />
      <Stack.Screen name="WorkerScopeStart" component={WorkerScopeStartRoute} />
      <Stack.Screen name="WorkerActiveWork" component={WorkerActiveWorkRoute} />
      <Stack.Screen name="WorkerCompletion" component={WorkerCompletionRoute} />
      <Stack.Screen name="ProjectReschedule" component={ProjectRescheduleRoute} />
      <Stack.Screen name="WorkerActivation" component={WorkerActivationRoute} />
      <Stack.Screen name="WorkerServicesProfile" component={WorkerServicesProfileRoute} />
      <Stack.Screen name="WorkerServiceCatalogue" component={WorkerServiceCatalogueRoute} />
      <Stack.Screen name="WorkerAccountReadiness" component={WorkerAccountReadinessRoute} />
      <Stack.Screen name="SafetyHelp" component={SafetyHelpRoute} />
      <Stack.Screen name="SafetyCentre" component={SafetyCentreRoute} />
      <Stack.Screen name="IncidentReport" component={IncidentReportRoute} />
      <Stack.Screen name="IncidentDetail" component={IncidentDetailRoute} />
      <Stack.Screen name="TrustFairness" component={TrustFairnessRoute} />
      <Stack.Screen name="NotificationControls" component={NotificationControlsRoute} />
      <Stack.Screen name="RecurringProposal" component={RecurringProposalRoute} />
      <Stack.Screen name="RecurringSeries" component={RecurringSeriesRoute} />
      <Stack.Screen name="RecurringOccurrence" component={RecurringOccurrenceRoute} />
      <Stack.Screen name="ProjectLiveStatus" component={ProjectLiveStatusRoute} />
      <Stack.Screen name="ActiveJob" component={ActiveJobScreen} />
      <Stack.Screen name="Chat" component={GroundedProjectChatRoute} />
      <Stack.Screen name="KYC" component={KYCScreen} />
      <Stack.Screen name="ScopeConfirm" component={ScopeConfirmScreen} />
    </Stack.Navigator>
  );
}
