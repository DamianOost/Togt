import * as SecureStore from 'expo-secure-store';
import {
  customerDraftStorageKey,
  decodeCustomerDraftEnvelope,
  encodeCustomerDraftEnvelope,
} from '../data/grounded';
import type { CustomerIntakeDraft } from '../features/customer/intake';

export type DraftStoreWriteResult =
  | Readonly<{ ok: true }>
  | Readonly<{ ok: false; reasonCode: 'invalid_actor' | 'invalid_draft' | 'draft_too_large' | 'secure_storage_unavailable' }>;

export async function saveCustomerIntakeDraft(
  actorId: string,
  draft: CustomerIntakeDraft,
  savedAt = new Date().toISOString(),
): Promise<DraftStoreWriteResult> {
  const encoded = encodeCustomerDraftEnvelope({ actorId, draft, savedAt });
  if (!encoded.ok) return encoded;
  try {
    await SecureStore.setItemAsync(customerDraftStorageKey(actorId), encoded.serialized, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    return Object.freeze({ ok: true });
  } catch {
    return Object.freeze({ ok: false, reasonCode: 'secure_storage_unavailable' });
  }
}

export async function loadCustomerIntakeDraft(
  actorId: string,
  now = new Date().toISOString(),
): Promise<CustomerIntakeDraft | null> {
  let key: string;
  try {
    key = customerDraftStorageKey(actorId);
  } catch {
    return null;
  }
  try {
    const serialized = await SecureStore.getItemAsync(key);
    const decoded = decodeCustomerDraftEnvelope({ actorId, serialized, now });
    if (decoded.ok) return decoded.value;
    if (decoded.reasonCode === 'expired' || decoded.reasonCode === 'invalid' || decoded.reasonCode === 'actor_mismatch') {
      await SecureStore.deleteItemAsync(key).catch(() => undefined);
    }
    return null;
  } catch {
    return null;
  }
}

export async function clearCustomerIntakeDraft(actorId: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(customerDraftStorageKey(actorId));
  } catch {
    // Local cleanup is best effort; no draft contents are logged.
  }
}
