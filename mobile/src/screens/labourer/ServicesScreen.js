import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Switch,
  Alert,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { useSelector } from 'react-redux';
import api from '../../services/api';
import { colors, typography, spacing, borderRadius, shadows } from '../../theme';

const SKILLS = [
  'Plumbing',
  'Electrical',
  'Cleaning',
  'Painting',
  'Carpentry',
  'Garden',
  'Tiling',
  'Moving',
  'General Labour',
  'Other',
];

function ServiceCard({ service, onToggle, onEdit }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardLeft}>
          <Text style={styles.cardTitle}>{service.title}</Text>
          <View style={styles.skillBadge}>
            <Text style={styles.skillBadgeText}>{service.skill}</Text>
          </View>
        </View>
        <Switch
          value={service.is_active}
          onValueChange={(val) => onToggle(service.id, val)}
          trackColor={{ false: colors.border, true: colors.accentLight }}
          thumbColor={service.is_active ? colors.accent : '#f4f3f4'}
        />
      </View>

      {service.description ? (
        <Text style={styles.cardDesc} numberOfLines={2}>
          {service.description}
        </Text>
      ) : null}

      <View style={styles.cardFooter}>
        {service.rate_per_hour ? (
          <Text style={styles.rateText}>R{service.rate_per_hour}/hr</Text>
        ) : (
          <Text style={styles.rateText}>Rate negotiable</Text>
        )}
        <TouchableOpacity style={styles.editBtn} onPress={() => onEdit(service)}>
          <Text style={styles.editBtnText}>Edit</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function AddEditModal({ visible, onClose, onSave, editingService }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [skill, setSkill] = useState(SKILLS[0]);
  const [rate, setRate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editingService) {
      setTitle(editingService.title || '');
      setDescription(editingService.description || '');
      setSkill(editingService.skill || SKILLS[0]);
      setRate(editingService.rate_per_hour ? String(editingService.rate_per_hour) : '');
    } else {
      setTitle('');
      setDescription('');
      setSkill(SKILLS[0]);
      setRate('');
    }
  }, [editingService, visible]);

  async function handleSave() {
    if (!title.trim()) {
      Alert.alert('Validation', 'Title is required');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        skill,
        rate_per_hour: rate ? parseFloat(rate) : null,
      });
      onClose();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to save service');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.modalCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.modalTitle}>{editingService ? 'Edit Service' : 'Add Service'}</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Text style={styles.modalSave}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
          <Text style={styles.fieldLabel}>Title *</Text>
          <TextInput
            style={styles.fieldInput}
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Expert Plumber"
            placeholderTextColor={colors.textMuted}
            maxLength={100}
          />

          <Text style={styles.fieldLabel}>Description</Text>
          <TextInput
            style={[styles.fieldInput, styles.fieldInputMulti]}
            value={description}
            onChangeText={setDescription}
            placeholder="Describe your service..."
            placeholderTextColor={colors.textMuted}
            multiline
            numberOfLines={3}
            maxLength={500}
          />

          <Text style={styles.fieldLabel}>Skill Category *</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.skillPicker}>
            {SKILLS.map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.skillOption, skill === s && styles.skillOptionActive]}
                onPress={() => setSkill(s)}
              >
                <Text style={[styles.skillOptionText, skill === s && styles.skillOptionTextActive]}>
                  {s}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.fieldLabel}>Hourly Rate (ZAR)</Text>
          <TextInput
            style={styles.fieldInput}
            value={rate}
            onChangeText={setRate}
            placeholder="e.g. 150"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
          />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

export default function ServicesScreen() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingService, setEditingService] = useState(null);

  useEffect(() => {
    loadServices();
  }, []);

  async function loadServices() {
    try {
      const res = await api.get('/api/services/my');
      setServices(res.data.services || []);
    } catch (err) {
      console.warn('Failed to load services:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggle(id, isActive) {
    try {
      const res = await api.put(`/api/services/${id}`, { is_active: isActive });
      setServices((prev) =>
        prev.map((s) => (s.id === id ? res.data.service : s))
      );
    } catch (err) {
      Alert.alert('Error', 'Could not update service status');
    }
  }

  function handleEdit(service) {
    setEditingService(service);
    setModalVisible(true);
  }

  function handleAdd() {
    setEditingService(null);
    setModalVisible(true);
  }

  async function handleSave(data) {
    if (editingService) {
      const res = await api.put(`/api/services/${editingService.id}`, data);
      setServices((prev) =>
        prev.map((s) => (s.id === editingService.id ? res.data.service : s))
      );
    } else {
      const res = await api.post('/api/services', data);
      setServices((prev) => [res.data.service, ...prev]);
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.screenTitle}>My Services</Text>
        <TouchableOpacity style={styles.addBtn} onPress={handleAdd}>
          <Text style={styles.addBtnText}>+ Add Service</Text>
        </TouchableOpacity>
      </View>

      {services.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🛠️</Text>
          <Text style={styles.emptyTitle}>No services yet</Text>
          <Text style={styles.emptySubtext}>
            Add your services so customers can find you
          </Text>
          <TouchableOpacity style={styles.emptyAddBtn} onPress={handleAdd}>
            <Text style={styles.emptyAddBtnText}>Add Your First Service</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={services}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ServiceCard service={item} onToggle={handleToggle} onEdit={handleEdit} />
          )}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      <AddEditModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        onSave={handleSave}
        editingService={editingService}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  screenTitle: {
    fontSize: typography.lg,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  addBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    ...shadows.card,
  },
  addBtnText: {
    color: colors.primary,
    fontWeight: '700',
    fontSize: typography.sm,
  },

  list: { padding: spacing.md, gap: spacing.sm },

  card: {
    backgroundColor: '#fff',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    ...shadows.card,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  cardLeft: { flex: 1, marginRight: spacing.sm },
  cardTitle: {
    fontSize: typography.md,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  skillBadge: {
    backgroundColor: colors.accentLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    alignSelf: 'flex-start',
  },
  skillBadgeText: {
    fontSize: typography.xs,
    color: colors.accentDark,
    fontWeight: '700',
  },
  cardDesc: {
    fontSize: typography.sm,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  rateText: {
    fontSize: typography.sm,
    fontWeight: '700',
    color: colors.success,
  },
  editBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  editBtnText: {
    fontSize: typography.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  emptyIcon: { fontSize: 56 },
  emptyTitle: {
    fontSize: typography.lg,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  emptySubtext: {
    fontSize: typography.sm,
    color: colors.textMuted,
    textAlign: 'center',
  },
  emptyAddBtn: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 4,
    borderRadius: borderRadius.lg,
    marginTop: spacing.sm,
    ...shadows.card,
  },
  emptyAddBtnText: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: typography.md,
  },

  // Modal
  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: typography.md,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  modalCancel: { fontSize: typography.sm, color: colors.textMuted },
  modalSave: { fontSize: typography.sm, color: colors.accent, fontWeight: '700' },
  modalBody: { padding: spacing.md },

  fieldLabel: {
    fontSize: typography.sm,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  fieldInput: {
    backgroundColor: '#f3f4f6',
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.sm,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fieldInputMulti: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  skillPicker: {
    flexDirection: 'row',
    marginBottom: spacing.xs,
  },
  skillOption: {
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.xs,
    backgroundColor: '#fff',
  },
  skillOptionActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  skillOptionText: {
    fontSize: typography.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  skillOptionTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
});
