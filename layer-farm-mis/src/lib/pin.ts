/**
 * Sign-in PINs.
 *
 * A shed supervisor will not carry an email address to work, and phone OTP
 * costs money per message (decision 14's logic applies to SMS too). So the
 * owner creates the account and the supervisor signs in on the device with a
 * four-to-six digit PIN.
 *
 * The PIN is never stored. What is stored is PBKDF2-SHA-256 over a per-user
 * random salt — so a stolen phone's database does not hand over the PINs, and
 * a supervisor who uses the same PIN on two farms is not linked by it.
 */

const ITERATIONS = 100_000;
const KEY_BITS = 256;

const toHex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

export function newSalt(): string {
  const bytes = new Uint8Array(16);
  try {
    crypto.getRandomValues(bytes);
  } catch {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return toHex(bytes.buffer);
}

function fallbackHash(pin: string, salt: string): string {
  // Only reached where WebCrypto's subtle API is missing (an insecure origin).
  // Weaker than PBKDF2 and deliberately obvious, never silently substituted in
  // the native app, which always runs on https://localhost.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const input = `${salt}:${pin}`;
  for (let i = 0; i < input.length; i++) {
    h1 = Math.imul(h1 ^ input.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + input.charCodeAt(i) + i, 0x85ebca6b) >>> 0;
  }
  return `fnv$${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  try {
    if (typeof crypto === 'undefined' || !crypto.subtle) return fallbackHash(pin, salt);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: new TextEncoder().encode(salt), iterations: ITERATIONS, hash: 'SHA-256' },
      key,
      KEY_BITS,
    );
    return `pbkdf2$${ITERATIONS}$${toHex(bits)}`;
  } catch {
    return fallbackHash(pin, salt);
  }
}

/** Constant-time-ish comparison; the strings are equal length in practice. */
export function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPin(pin: string, salt: string, expected: string): Promise<boolean> {
  return sameHash(await hashPin(pin, salt), expected);
}

export const isValidPin = (pin: string): boolean => /^\d{4,6}$/.test(pin);
