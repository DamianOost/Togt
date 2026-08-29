import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { motion } from './tokens';

export function durationForMotionPreference(
  duration: number,
  reduceMotionEnabled: boolean,
): number {
  return reduceMotionEnabled ? Math.min(duration, motion.duration.reduced) : duration;
}

export function translationForMotionPreference(
  translation: number,
  reduceMotionEnabled: boolean,
): number {
  if (reduceMotionEnabled) return 0;
  return Math.max(-motion.maxTranslation, Math.min(motion.maxTranslation, translation));
}

export function useReducedMotion(): boolean {
  // Fail safe on first paint so a user never sees motion before their system
  // preference has resolved.
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState(true);

  useEffect(() => {
    let mounted = true;

    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotionEnabled(enabled);
    });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotionEnabled,
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotionEnabled;
}
