const PIN_PREFIX = 'premium-retail-device-pin:';
const LOCK_PREFIX = 'premium-retail-device-locked:';
export const DEVICE_LOCK_CHANGED = 'premium-retail-device-lock-change';

export const REQUEST_DEVICE_LOCK = 'premium-retail-request-device-lock';

type PinVerifier = { salt: number[]; digest: string };

function verifier(userId: string): PinVerifier | null {
  try {
    const value = window.localStorage.getItem(PIN_PREFIX + userId);
    return value ? JSON.parse(value) as PinVerifier : null;
  } catch {
    return null;
  }
}

export function hasDevicePin(userId: string) {
  return Boolean(verifier(userId));
}

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>) {
  const secret = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 600_000, hash: 'SHA-256' }, secret, 256);
  return Array.from(new Uint8Array(bits), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function saveDevicePin(userId: string, pin: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const digest = await derive(pin, salt);
  window.localStorage.setItem(PIN_PREFIX + userId, JSON.stringify({ salt: Array.from(salt), digest }));
  window.dispatchEvent(new Event(DEVICE_LOCK_CHANGED));
}

export async function matchesDevicePin(userId: string, pin: string) {
  const saved = verifier(userId);
  return Boolean(saved && await derive(pin, new Uint8Array(saved.salt)) === saved.digest);
}

export function isDeviceLocked(userId: string) {
  try { return window.localStorage.getItem(LOCK_PREFIX + userId) === '1'; }
  catch { return false; }
}

export function setDeviceLocked(userId: string, locked: boolean) {
  if (locked) window.localStorage.setItem(LOCK_PREFIX + userId, '1');
  else window.localStorage.removeItem(LOCK_PREFIX + userId);
  window.dispatchEvent(new Event(DEVICE_LOCK_CHANGED));
}
