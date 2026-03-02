import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { registerThunk } from '../../store/authSlice';

export default function RegisterScreen({ route, navigation }) {
  const preselectedRole = route.params?.role || 'customer';
  const dispatch = useDispatch();
  const { loading, error, user } = useSelector((s) => s.auth);

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: preselectedRole,
  });
  const [registered, setRegistered] = useState(false);

  // Watch for successful registration → show KYC prompt
  useEffect(() => {
    if (registered && user) {
      setRegistered(false);
      // Navigate to KYC prompt immediately after registration
      navigation.navigate('KYC');
    }
  }, [user, registered]);

  function set(key) {
    return (value) => setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleRegister() {
    if (!form.name || !form.email || !form.phone || !form.password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setRegistered(true);
    dispatch(registerThunk(form));
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>
          Joining as a <Text style={styles.roleText}>{form.role === 'customer' ? 'Customer' : 'Labourer'}</Text>
        </Text>

        {/* Role Toggle */}
        <View style={styles.roleToggle}>
          {['customer', 'labourer'].map((r) => (
            <TouchableOpacity
              key={r}
              style={[styles.roleBtn, form.role === r && styles.roleBtnActive]}
              onPress={() => set('role')(r)}
            >
              <Text style={[styles.roleBtnText, form.role === r && styles.roleBtnTextActive]}>
                {r === 'customer' ? 'Customer' : 'Labourer'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <TextInput
          style={styles.input}
          placeholder="Full Name"
          value={form.name}
          onChangeText={set('name')}
          autoCapitalize="words"
        />
        <TextInput
          style={styles.input}
          placeholder="Email Address"
          value={form.email}
          onChangeText={set('email')}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Phone Number (e.g. 0821234567)"
          value={form.phone}
          onChangeText={set('phone')}
          keyboardType="phone-pad"
        />
        <TextInput
          style={styles.input}
          placeholder="Password (min 8 characters)"
          value={form.password}
          onChangeText={set('password')}
          secureTextEntry
        />

        <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create Account</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.link}>
          <Text style={styles.linkText}>Already have an account? <Text style={styles.linkBold}>Log in</Text></Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  scroll: { padding: 24, paddingTop: 40 },
  title: { fontSize: 28, fontWeight: '800', color: '#111827', marginBottom: 4 },
  subtitle: { fontSize: 15, color: '#6B7280', marginBottom: 24 },
  roleText: { color: '#1A6B3A', fontWeight: '700' },
  roleToggle: { flexDirection: 'row', marginBottom: 24, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#E5E7EB' },
  roleBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: '#fff' },
  roleBtnActive: { backgroundColor: '#1A6B3A' },
  roleBtnText: { fontSize: 15, fontWeight: '600', color: '#6B7280' },
  roleBtnTextActive: { color: '#fff' },
  error: { color: '#EF4444', marginBottom: 12, fontSize: 14 },
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
