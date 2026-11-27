import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const keyLength = 64;
const saltLength = 16;

// scrypt avoids an extra native dependency while keeping a memory-hard hash.
export async function hashPassword(password: string) {
  const salt = randomBytes(saltLength);
  const hash = (await scrypt(password, salt, keyLength)) as Buffer;
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, salt, expected] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !expected) return false;
  const hash = (await scrypt(password, Buffer.from(salt, 'base64url'), keyLength)) as Buffer;
  const expectedHash = Buffer.from(expected, 'base64url');
  return hash.length === expectedHash.length && timingSafeEqual(hash, expectedHash);
}

export function createSessionToken() {
  return randomBytes(32).toString('base64url');
}

export function digestToken(token: string) {
  return createHash('sha256').update(token).digest('base64url');
}
