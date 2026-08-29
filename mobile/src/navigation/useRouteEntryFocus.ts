import { useCallback, useContext, useEffect, useRef } from 'react';
import type { Component, RefObject } from 'react';
import { NavigationContext } from '@react-navigation/native';
import {
  AccessibilityInfo,
  findNodeHandle,
  InteractionManager,
} from 'react-native';

export type RouteEntryFocusOptions = Readonly<{
  enabled?: boolean;
  fallbackAnnouncement?: string;
}>;

/** Moves screen-reader focus to a stable heading after a navigation transition. */
export function useRouteEntryFocus<T extends Component<any, any>>(
  options: RouteEntryFocusOptions = {},
): RefObject<T | null> {
  const { enabled = true, fallbackAnnouncement } = options;
  const navigation = useContext(NavigationContext);
  const targetRef = useRef<T>(null);

  const scheduleFocus = useCallback(() => {
    if (!enabled) return () => {};
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      void AccessibilityInfo.isScreenReaderEnabled().then((screenReaderEnabled) => {
        if (cancelled || !screenReaderEnabled) return;
        const node = findNodeHandle(targetRef.current);
        if (node !== null) AccessibilityInfo.setAccessibilityFocus(node);
        else if (fallbackAnnouncement) {
          AccessibilityInfo.announceForAccessibility(fallbackAnnouncement);
        }
      });
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [enabled, fallbackAnnouncement]);

  useEffect(() => {
    let cancelPending = () => {};
    const focus = () => {
      cancelPending();
      cancelPending = scheduleFocus();
    };
    const unsubscribe = navigation?.addListener('focus', focus);
    if (!navigation || navigation.isFocused()) focus();
    return () => {
      cancelPending();
      unsubscribe?.();
    };
  }, [navigation, scheduleFocus]);

  return targetRef;
}

export default useRouteEntryFocus;
