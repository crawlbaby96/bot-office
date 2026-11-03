import manifest from './managers.json' with { type: 'json' };

const byPhoto = new Map(manifest.map((m) => [m.photo, m]));

export function listManagers() {
  return manifest;
}

export function normalizeManagerPhoto(value) {
  if (value == null || value === '') return null;
  const photo = String(value).trim();
  if (!photo) return null;
  return byPhoto.has(photo) ? photo : null;
}

export function managerForPhoto(photo) {
  return photo ? byPhoto.get(photo) ?? null : null;
}
