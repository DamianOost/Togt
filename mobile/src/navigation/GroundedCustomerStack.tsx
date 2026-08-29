import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSelector } from 'react-redux';

import { useTogtTheme } from '../design';
import {
  CustomerAddressRoute,
  CustomerActiveWorkRoute,
  CustomerExperienceProvider,
  CustomerHomeRoute,
  CustomerJobBriefRoute,
  GroundedProjectChatRoute,
  GroundedWorkerProfileRoute,
  CustomerCompletionIssueRoute,
  CustomerCompletionPaymentRoute,
  CustomerProjectHubRoute,
  CustomerProjectsRoute,
  CustomerOpenQuoteRequestsRoute,
  CustomerQuoteRequestRoute,
  CustomerReviewRoute,
  CustomerScheduleRoute,
  CustomerServiceSelectRoute,
  CustomerScopeStartRoute,
} from '../features/customer/integration';
import {
  IncidentDetailRoute,
  IncidentReportRoute,
  NotificationControlsRoute,
  RebookDraftRoute,
  RecurringOccurrenceRoute,
  RecurringProposalRoute,
  RecurringSeriesRoute,
  RelationshipsRoute,
  SafeSharingRoute,
  SafetyCentreRoute,
  SafetyHelpRoute,
  TrustFairnessRoute,
} from '../features/trust/integration';
import {
  CustomerAssistedIntakeRoute,
  CustomerRecommendationExplanationRoute,
  ProjectLiveStatusRoute,
} from '../features/intelligence/integration';
import { ProjectRescheduleRoute } from '../features/fulfilment/integration';
import CustomerAccountScreen from '../screens/account/CustomerAccountScreen';
import ActiveBookingScreen from '../screens/customer/ActiveBookingScreen';
import PaymentScreen from '../screens/customer/PaymentScreen';
import KYCScreen from '../screens/shared/KYCScreen';
import ScopeConfirmScreen from '../screens/shared/ScopeConfirmScreen';
import GroundedTabIcon from './GroundedTabIcon';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function CustomerTabs() {
  const theme = useTogtTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.actionPrimary,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarHideOnKeyboard: true,
        tabBarLabelStyle: theme.typography.caption,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          minHeight: theme.sizing.touchTarget + theme.spacing.md,
          paddingBottom: theme.spacing.xs,
          paddingTop: theme.spacing.xs,
        },
        tabBarIcon: ({ color, focused, size }) => {
          const icon = route.name === 'Home'
            ? 'home-outline'
            : route.name === 'Projects'
              ? 'clipboard-text-outline'
              : 'account-circle-outline';
          return <GroundedTabIcon color={color} focused={focused} name={icon} size={size} />;
        },
      })}
    >
      <Tab.Screen name="Home" component={CustomerHomeRoute} />
      <Tab.Screen name="Projects" component={CustomerProjectsRoute} />
      <Tab.Screen name="Account" component={CustomerAccountScreen} />
    </Tab.Navigator>
  );
}

export default function GroundedCustomerStack() {
  const actorId = useSelector((state: any) => state.auth.user?.id || '');
  return (
    <CustomerExperienceProvider actorId={actorId}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="CustomerTabs" component={CustomerTabs} />
        <Stack.Screen name="ServiceSelect" component={CustomerServiceSelectRoute} />
        <Stack.Screen name="JobBrief" component={CustomerJobBriefRoute} />
        <Stack.Screen name="Address" component={CustomerAddressRoute} />
        <Stack.Screen name="Schedule" component={CustomerScheduleRoute} />
        <Stack.Screen name="ReviewEstimate" component={CustomerReviewRoute} />
        <Stack.Screen name="QuoteRequest" component={CustomerQuoteRequestRoute} />
        <Stack.Screen name="QuoteRequests" component={CustomerOpenQuoteRequestsRoute} />
        <Stack.Screen name="ProjectHub" component={CustomerProjectHubRoute} />
        <Stack.Screen name="SafeSharing" component={SafeSharingRoute} />
        <Stack.Screen name="ScopeStart" component={CustomerScopeStartRoute} />
        <Stack.Screen name="ActiveWork" component={CustomerActiveWorkRoute} />
        <Stack.Screen name="CompletionPayment" component={CustomerCompletionPaymentRoute} />
        <Stack.Screen name="CompletionIssue" component={CustomerCompletionIssueRoute} />
        <Stack.Screen name="ProjectReschedule" component={ProjectRescheduleRoute} />
        <Stack.Screen name="SafetyHelp" component={SafetyHelpRoute} />
        <Stack.Screen name="SafetyCentre" component={SafetyCentreRoute} />
        <Stack.Screen name="IncidentReport" component={IncidentReportRoute} />
        <Stack.Screen name="IncidentDetail" component={IncidentDetailRoute} />
        <Stack.Screen name="TrustFairness" component={TrustFairnessRoute} />
        <Stack.Screen name="NotificationControls" component={NotificationControlsRoute} />
        <Stack.Screen name="Relationships" component={RelationshipsRoute} />
        <Stack.Screen name="RebookDraft" component={RebookDraftRoute} />
        <Stack.Screen name="RecurringProposal" component={RecurringProposalRoute} />
        <Stack.Screen name="RecurringSeries" component={RecurringSeriesRoute} />
        <Stack.Screen name="RecurringOccurrence" component={RecurringOccurrenceRoute} />
        <Stack.Screen name="AssistedIntake" component={CustomerAssistedIntakeRoute} />
        <Stack.Screen name="RecommendationExplanation" component={CustomerRecommendationExplanationRoute} />
        <Stack.Screen name="ProjectLiveStatus" component={ProjectLiveStatusRoute} />
        <Stack.Screen name="LabourerProfile" component={GroundedWorkerProfileRoute} />
        <Stack.Screen name="ActiveBooking" component={ActiveBookingScreen} />
        <Stack.Screen name="Payment" component={PaymentScreen} />
        <Stack.Screen name="Chat" component={GroundedProjectChatRoute} />
        <Stack.Screen name="KYC" component={KYCScreen} />
        <Stack.Screen name="ScopeConfirm" component={ScopeConfirmScreen} />
      </Stack.Navigator>
    </CustomerExperienceProvider>
  );
}
