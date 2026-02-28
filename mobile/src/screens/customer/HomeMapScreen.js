import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator, Alert, SafeAreaView, RefreshControl,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSelector, useDispatch } from 'react-redux';
import { logout } from '../../store/authSlice';
import { locationService } from '../../services/locationService';
import api from '../../services/api';
import LabourerCard from '../../components/LabourerCard';

const SKILLS = ['All', 'Plumbing', 'Painting', 'Electrical', 'Building', 'Cleaning', 'Tiling', 'Garden', 'Carpentry', 'Welding'];

export default function HomeMapScreen({ navigation }) {
  const dispatch = useDispatch();
  const { user } = useSelector((s) => s.auth);
  const [location, setLocation] = useState(null);
  const [labourers, setLabourers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedSkill, setSelectedSkill] = useState('All');
  const [showList, setShowList] = useState(false);
  const mapRef = useRef(null);

  useEffect(() => {
    async function init() {
      const granted = await locationService.requestPermission();
      if (!granted) {
        Alert.alert('Location needed', 'Please allow location to find nearby labourers.');
        return;
      }
      const pos = await locationService.getCurrentPosition();
      setLocation(pos);
      fetchLabourers(pos, null);
    }
    init();
  }, []);

  async function fetchLabourers(pos, skill) {
    setLoading(true);
    try {
      const params = { lat: pos.lat, lng: pos.lng, radius: 50 };
      if (skill && skill !== 'All') params.skill = skill;
      const res = await api.get('/labourers', { params });
      setLabourers(res.data.labourers);
    } catch {
      Alert.alert('Error', 'Could not load labourers');
    } finally {
      setLoading(false);
    }
  }

  const onRefresh = useCallback(async () => {
    if (!location) return;
    setRefreshing(true);
    await fetchLabourers(location, selectedSkill);
    setRefreshing(false);
  }, [location, selectedSkill]);

  function selectSkill(skill) {
    setSelectedSkill(skill);
    if (location) fetchLabourers(location, skill);
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Find a Labourer</Text>
          <Text style={styles.greeting}>Hi {user?.name?.split(' ')[0]} 👋</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerBtn} onPress={onRefresh}>
            <Text style={styles.headerBtnText}>🔄</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.getParent()?.navigate('Bookings')}>
            <Text style={styles.bookingsLink}>My Bookings</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => dispatch(logout())}>
            <Text style={styles.logoutLink}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Skill filter chips */}
      <FlatList
        horizontal
        data={SKILLS}
        keyExtractor={(s) => s}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.chip, selectedSkill === item && styles.chipActive]}
            onPress={() => selectSkill(item)}
          >
            <Text style={[styles.chipText, selectedSkill === item && styles.chipTextActive]}>
              {item}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Map or List */}
      {!showList ? (
        location ? (
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={{
              latitude: location.lat,
              longitude: location.lng,
              latitudeDelta: 0.15,
              longitudeDelta: 0.15,
            }}
          >
            {/* User location */}
            <Marker coordinate={{ latitude: location.lat, longitude: location.lng }} title="You" pinColor="blue" />

            {/* Labourer markers */}
            {labourers.map((l) =>
              l.current_lat && l.current_lng ? (
                <Marker
                  key={l.id}
                  coordinate={{ latitude: parseFloat(l.current_lat), longitude: parseFloat(l.current_lng) }}
                  title={l.name}
                  description={`${(l.skills || []).join(', ')} — R${l.hourly_rate}/hr`}
                  onCalloutPress={() => navigation.navigate('LabourerProfile', { labourer: l })}
                />
              ) : null
            )}
          </MapView>
        ) : (
          <ActivityIndicator style={{ flex: 1 }} color="#1A6B3A" />
        )
      ) : (
        <View style={styles.list}>
          {loading ? (
            <ActivityIndicator color="#1A6B3A" style={{ marginTop: 20 }} />
          ) : labourers.length === 0 ? (
            <Text style={styles.empty}>No labourers found nearby. Try expanding your search or check back later.</Text>
          ) : (
            <FlatList
              data={labourers}
              keyExtractor={(l) => l.id}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1A6B3A']} />}
              renderItem={({ item }) => (
                <LabourerCard
                  labourer={item}
                  distance={item.distance_km}
                  onPress={() => navigation.navigate('LabourerProfile', { labourer: item })}
                />
              )}
              contentContainerStyle={{ padding: 16 }}
            />
          )}
        </View>
      )}

      {/* Toggle list/map button */}
      <TouchableOpacity style={styles.toggleBtn} onPress={() => setShowList((v) => !v)}>
        <Text style={styles.toggleBtnText}>{showList ? '🗺️ Show Map' : `📋 Show List (${labourers.length})`}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 20, fontWeight: '800', color: '#111827' },
  greeting: { fontSize: 14, color: '#6B7280', marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerBtn: { padding: 6 },
  headerBtnText: { fontSize: 20 },
  bookingsLink: { color: '#1A6B3A', fontWeight: '600', fontSize: 14 },
  logoutLink: { color: '#EF4444', fontWeight: '600', fontSize: 13 },
  chips: { paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB' },
  chipActive: { backgroundColor: '#1A6B3A', borderColor: '#1A6B3A' },
  chipText: { fontSize: 13, color: '#374151', fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  map: { flex: 1 },
  toggleBtn: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    backgroundColor: '#1A6B3A',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  toggleBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  list: { flex: 1 },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 40, fontSize: 15, paddingHorizontal: 32 },
});
