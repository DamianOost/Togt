import React, { useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Dimensions,
  ScrollView, StatusBar, SafeAreaView,
} from 'react-native';
import { colors, typography, spacing, borderRadius } from '../../theme';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    icon: '🔍',
    title: 'Find skilled workers near you',
    subtitle: 'Browse hundreds of verified, rated labourers in your area — plumbers, painters, electricians and more.',
    color: colors.accent,
  },
  {
    icon: '⚡',
    title: 'Book in 60 seconds',
    subtitle: 'Pick a skill, choose a time, confirm. Your labourer gets notified instantly and heads your way.',
    color: colors.info,
  },
  {
    icon: '🛡️',
    title: 'Safe, rated & insured',
    subtitle: 'Every labourer is background-checked and rated by real customers. Your satisfaction is guaranteed.',
    color: colors.success,
  },
];

export default function OnboardingScreen({ navigation }) {
  const scrollRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);

  function goNext() {
    if (activeIndex < SLIDES.length - 1) {
      const next = activeIndex + 1;
      scrollRef.current?.scrollTo({ x: next * width, animated: true });
      setActiveIndex(next);
    } else {
      navigation.navigate('Login');
    }
  }

  function handleScroll(e) {
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    setActiveIndex(idx);
  }

  const isLast = activeIndex === SLIDES.length - 1;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primary} />
      <SafeAreaView style={styles.safeArea}>
        {/* Skip button */}
        <TouchableOpacity
          style={styles.skipBtn}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>

        {/* Slides */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={handleScroll}
          style={styles.slides}
        >
          {SLIDES.map((slide, i) => (
            <View key={i} style={styles.slide}>
              <View style={[styles.iconCircle, { backgroundColor: slide.color + '22' }]}>
                <Text style={styles.icon}>{slide.icon}</Text>
              </View>
              <Text style={styles.slideTitle}>{slide.title}</Text>
              <Text style={styles.slideSubtitle}>{slide.subtitle}</Text>
            </View>
          ))}
        </ScrollView>

        {/* Dots */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === activeIndex && styles.dotActive]}
            />
          ))}
        </View>

        {/* CTA button */}
        <TouchableOpacity style={styles.ctaBtn} onPress={goNext}>
          <Text style={styles.ctaBtnText}>
            {isLast ? 'Get Started' : 'Next'}
          </Text>
        </TouchableOpacity>

        {/* Login link */}
        <View style={styles.loginRow}>
          <Text style={styles.loginPrompt}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.loginLink}>Log in</Text>
          </TouchableOpacity>
        </View>

        {/* Sign up as labourer */}
        <View style={styles.roleRow}>
          <TouchableOpacity
            style={styles.roleBtn}
            onPress={() => navigation.navigate('Register', { role: 'customer' })}
          >
            <Text style={styles.roleBtnText}>🔨 Need a labourer</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.roleBtn, styles.roleBtnDark]}
            onPress={() => navigation.navigate('Register', { role: 'labourer' })}
          >
            <Text style={styles.roleBtnText}>💼 I'm a labourer</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  safeArea: {
    flex: 1,
    alignItems: 'center',
  },
  skipBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  skipText: {
    color: colors.textMuted,
    fontSize: typography.sm,
    fontWeight: '600',
  },
  slides: {
    flex: 1,
    width,
  },
  slide: {
    width,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  icon: {
    fontSize: 56,
  },
  slideTitle: {
    fontSize: typography.xl,
    fontWeight: '800',
    color: colors.textInverse,
    textAlign: 'center',
    marginBottom: spacing.md,
    lineHeight: 32,
  },
  slideSubtitle: {
    fontSize: typography.md,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 24,
  },
  dots: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.borderDark,
  },
  dotActive: {
    width: 24,
    backgroundColor: colors.accent,
  },
  ctaBtn: {
    backgroundColor: colors.accent,
    width: width - spacing.xl * 2,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  ctaBtnText: {
    color: colors.primary,
    fontSize: typography.lg,
    fontWeight: '800',
  },
  loginRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  loginPrompt: {
    color: colors.textMuted,
    fontSize: typography.sm,
  },
  loginLink: {
    color: colors.accent,
    fontSize: typography.sm,
    fontWeight: '700',
  },
  roleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  roleBtn: {
    flex: 1,
    backgroundColor: colors.primaryLight,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderDark,
  },
  roleBtnDark: {
    backgroundColor: '#0d0d1a',
  },
  roleBtnText: {
    color: colors.textInverse,
    fontSize: typography.sm,
    fontWeight: '600',
  },
});
