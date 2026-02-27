import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, ActivityIndicator, Alert, SafeAreaView,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useSelector, useDispatch } from 'react-redux';
import { logout } from '../../store/authSlice';
import { locationService } from '../../services/locationService';
import api from '../../services/api';
import LabourerCard from '../../components/LabourerCard';

const SKILLS = ['All', 'Plumbing', 'Painting', 'Electrical', 'Building', 'Cleaning', 'Tiling', 'Garden'];

export default function HomeMapScreen({ navigation }) {
  const dispatch = useDispatch();
  const { user } = useSelector((s) => s.auth);
  const [location, setLocation] = useState(null);
  const [labourers, setLabourers] = useState([]);
  const [loading, setLoading] = useState(true);
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
      const params = { lat: pos.lat, lng: pos.lng, radius: 25 };
      if (skill && skill !== 'All') params.skill = skill;
      const res = await api.get('/labourers', { params });
      setLabourers(res.data.labourers);
    } catch {
      Alert.alert('Error', 'Could not load labourers');
    } finally {
      setLoading(false);
    }
  }

  function selectSkill(skill) {
    setSelectedSkill(skill);
    if (location) fetchLabourers(location, skill);
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.greeting}>Hi {user?.name?.split(' ')[0]} 👋</Text>
        <TouchableOpacity onPress={() => navigation.navigate('MyBookings')}>
          <Text style={styles.bookingsLink}>My Bookings</Text>
        </TouchableOpacity>
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

      {/* Map */}
      {location && (
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={{
            latitude: location.lat,
            longitude: location.lng,
            latitudeDelta: 0.1,
            longitudeDelta: 0.1,
          }}
        >
          {/* User location */}
          <Marker coordinate={{ latitude: location.lat, longitude: location.lng }} title="You" pinColor="blue" />

          {/* Labourer markers */}
          {labourers.map((l) =>
            l.current_lat && l.current_lng ? (
              <Marker
                key={l.id}
                coordinate={{ latitude: l.current_lat, longitude: l.current_lng }}
                title={l.name}
                description={(l.skills || []).join(', ')}
                onCalloutPress={() => navigation.navigate('LabourerProfile', { labourer: l })}
              />
            ) : null
          )}
        </MapView>
      )}

      {/* Toggle list button */}
      <TouchableOpacity style={styles.toggleBtn} onPress={() => setShowList((v) => !v)}>
        <Text style={styles.toggleBtnText}>{showList ? 'Show Map' : `Show List (${labourers.length})`}</Text>
      </TouchableOpacity>

      {/* Labourer list */}
      {showList && (
        <View style={styles.list}>
          {loading ? (
            <ActivityIndicator color="#1A6B3A" style={{ marginTop: 20 }} />
          ) : labourers.length === 0 ? (
            <Text style={styles.empty}>No labourers found nearby.</Text>
          ) : (
            <FlatList
              data={labourers}
              keyExtractor={(l) => l.id}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  greeting: { fontSize: 18, fontWeight: '700', color: '#111827' },
  bookingsLink: { color: '#1A6B3A', fontWeight: '600', fontSize: 14 },
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
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 40, fontSize: 15 },
});
