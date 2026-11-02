/** Pure password + session-token helpers. Server-only: uses node:crypto. */

import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "harmonise_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1 } as const;

function scryptKey(password: string | Buffer, salt: Buffer, keyLength: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, SCRYPT_OPTIONS, (error, derived) => {
      if (error) reject(error);
      else resolve(derived as Buffer);
    });
  });
}

export type PasswordHash = { salt: Uint8Array; hash: Uint8Array };

export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = randomBytes(32);
  const hash = await scryptKey(password, salt, SCRYPT_KEY_LENGTH);
  return { salt: new Uint8Array(salt), hash: new Uint8Array(hash) };
}

export async function verifyPassword(
  password: string,
  salt: Uint8Array,
  hash: Uint8Array,
): Promise<boolean> {
  if (hash.length !== SCRYPT_KEY_LENGTH) return false;
  const candidate = await scryptKey(Buffer.from(password, "utf8"), Buffer.from(salt), SCRYPT_KEY_LENGTH);
  return timingSafeEqual(candidate, Buffer.from(hash));
}

/** Dummy hash used so unknown emails cost the same time as real checks. */
export async function dummyVerify(): Promise<void> {
  await scryptKey("harmonise-dummy", randomBytes(32), SCRYPT_KEY_LENGTH);
}

/** Opaque session token; only its SHA-256 is stored. */
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
