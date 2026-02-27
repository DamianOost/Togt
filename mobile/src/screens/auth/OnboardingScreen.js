import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView, Image,
} from 'react-native';

export default function OnboardingScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.appName}>Togt</Text>
        <Text style={styles.tagline}>Connecting skilled labourers with people who need them — across South Africa.</Text>
      </View>

      <View style={styles.cards}>
        <TouchableOpacity
          style={[styles.card, styles.cardGreen]}
          onPress={() => navigation.navigate('Register', { role: 'customer' })}
        >
          <Text style={styles.cardIcon}>🔨</Text>
          <Text style={styles.cardTitle}>I Need a Labourer</Text>
          <Text style={styles.cardSub}>Find skilled workers near you</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, styles.cardDark]}
          onPress={() => navigation.navigate('Register', { role: 'labourer' })}
        >
          <Text style={styles.cardIcon}>💼</Text>
          <Text style={styles.cardTitle}>I Am a Labourer</Text>
          <Text style={styles.cardSub}>Find jobs and earn money</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.loginLink} onPress={() => navigation.navigate('Login')}>
        <Text style={styles.loginText}>Already have an account? <Text style={styles.loginBold}>Log in</Text></Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 24,
  },
  hero: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 40,
  },
  appName: {
    fontSize: 56,
    fontWeight: '900',
    color: '#1A6B3A',
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 24,
    maxWidth: 280,
  },
  cards: {
    gap: 16,
    marginBottom: 32,
  },
  card: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  cardGreen: {
    backgroundColor: '#1A6B3A',
  },
  cardDark: {
    backgroundColor: '#1F2937',
  },
  cardIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
  },
  cardSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.75)',
  },
  loginLink: {
    alignItems: 'center',
    paddingBottom: 32,
  },
  loginText: {
    fontSize: 15,
    color: '#6B7280',
  },
  loginBold: {
    color: '#1A6B3A',
    fontWeight: '600',
  },
});
