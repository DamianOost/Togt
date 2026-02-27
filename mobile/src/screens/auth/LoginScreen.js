import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { loginThunk } from '../../store/authSlice';

export default function LoginScreen({ navigation }) {
  const dispatch = useDispatch();
  const { loading, error } = useSelector((s) => s.auth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function handleLogin() {
    if (!email || !password) return;
    dispatch(loginThunk({ email, password }));
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.logo}>Togt</Text>
        <Text style={styles.title}>Welcome back</Text>

        {error && <Text style={styles.error}>{error}</Text>}

        <TextInput
          style={styles.input}
          placeholder="Email Address"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.buttonText}>Log In</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Onboarding')} style={styles.link}>
          <Text style={styles.linkText}>Don't have an account? <Text style={styles.linkBold}>Sign up</Text></Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  content: { flex: 1, padding: 24, justifyContent: 'center' },
  logo: { fontSize: 40, fontWeight: '900', color: '#1A6B3A', textAlign: 'center', marginBottom: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 32 },
  error: { color: '#EF4444', marginBottom: 12, fontSize: 14, textAlign: 'center' },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#1A6B3A',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  link: { alignItems: 'center', marginTop: 20 },
  linkText: { fontSize: 14, color: '#6B7280' },
  linkBold: { color: '#1A6B3A', fontWeight: '600' },
});
