import { useNetInfo } from '@react-native-community/netinfo';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';

import {
  adaptGroundedWorkerPublicProfileV1,
  publicProfileUuid,
  publicProfileWhole,
} from '../../../data/grounded/publicWorkerProfile';
import api from '../../../services/api';
import { WorkerProfileScreen } from '../projects';
import type { Loadable, WorkerProfileSnapshot } from '../projects';
import { useCustomerExperience } from './CustomerExperienceContext';

export function GroundedWorkerProfileRoute({ navigation, route }: { navigation: any; route: any }) {
  const workerId = publicProfileUuid(route.params?.workerId) ?? '';
  const preferredServiceId = publicProfileUuid(route.params?.serviceId);
  const preferredServiceVersion = publicProfileWhole(route.params?.serviceVersion, 1);
  const network = useNetInfo();
  const connectionState = network.isConnected === false || network.isInternetReachable === false ? 'offline' : 'online';
  const { selectService } = useCustomerExperience();
  const [profile, setProfile] = useState<Loadable<WorkerProfileSnapshot>>({ state: 'loading' });

  const refresh = useCallback(async () => {
    if (!workerId) {
      setProfile({ state: 'empty' });
      return;
    }
    if (connectionState === 'offline') {
      setProfile((current) => current.state === 'ready'
        ? { ...current, connectionState: 'offline' }
        : { state: 'error', correlationId: null });
      return;
    }
    setProfile((current) => current.state === 'ready' ? current : { state: 'loading' });
    try {
      const response = await api.get(`/api/labourers/${workerId}/grounded-profile`);
      const adapted = adaptGroundedWorkerPublicProfileV1(
        response.data,
        workerId,
        preferredServiceId,
        preferredServiceVersion,
      );
      if (!adapted) throw new Error('grounded_worker_public_profile_contract_invalid');
      setProfile({ state: 'ready', value: adapted, connectionState, lastUpdatedAt: new Date().toISOString() });
    } catch {
      setProfile({ state: 'error', correlationId: null });
    }
  }, [connectionState, preferredServiceId, preferredServiceVersion, workerId]);

  useFocusEffect(useCallback(() => {
    void refresh();
  }, [refresh]));

  const startService = (serviceId: string, serviceVersion: number) => {
    if (selectService(serviceId, serviceVersion)) navigation.navigate('JobBrief');
    else navigation.navigate('ServiceSelect');
  };

  return (
    <WorkerProfileScreen
      onBack={() => navigation.canGoBack() ? navigation.goBack() : navigation.navigate('CustomerTabs', { screen: 'Home' })}
      onRequestService={(_selectedWorkerId, serviceId, serviceVersion) => startService(serviceId, serviceVersion)}
      onRetry={() => { void refresh(); }}
      onSeeAlternatives={(serviceId) => {
        const selected = profile.state === 'ready'
          ? profile.value.serviceVariants.find((service) => serviceId !== null && service.serviceId === serviceId)
          : null;
        if (selected) startService(selected.serviceId, selected.serviceVersion);
        else navigation.navigate('ServiceSelect');
      }}
      profile={profile}
    />
  );
}

export default GroundedWorkerProfileRoute;
