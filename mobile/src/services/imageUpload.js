import Constants from 'expo-constants';

const BASE_URL = Constants.expoConfig?.extra?.apiUrl || 'http://localhost:3000';

/**
 * Upload a local image URI to Cloudinary via the Togt backend.
 *
 * @param {string} localUri  - The local file URI from expo-image-picker (e.g. file:///...)
 * @param {string} token     - The user's JWT bearer token
 * @returns {Promise<{url: string, public_id: string}>}
 */
export async function uploadProfileImage(localUri, token) {
  const formData = new FormData();

  // Determine filename & mime type from the URI
  const filename = localUri.split('/').pop();
  const ext = filename.split('.').pop().toLowerCase();
  const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

  formData.append('image', {
    uri: localUri,
    name: filename,
    type: mimeType,
  });

  const response = await fetch(`${BASE_URL}/upload/profile-image`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      // Do NOT set Content-Type here — fetch sets it automatically with the correct boundary
    },
    body: formData,
  });

  if (!response.ok) {
    let message = `Upload failed (${response.status})`;
    try {
      const data = await response.json();
      if (data.error) message = data.error;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }

  const data = await response.json();
  return { url: data.url, public_id: data.public_id };
}
