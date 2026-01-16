import { createHash, randomBytes, timingSafeEqual } from 'crypto';

/**
 * API Key Generation and Management Utilities
 *
 * Key formats:
 * - Public Key: imgcdn_pk_{base62_22chars}
 * - Secret Key: imgcdn_sk_{base62_32chars}
 *
 * Public keys are used in URLs and can be safely exposed.
 * Secret keys are used for API authentication and signing.
 */

const PUBLIC_KEY_PREFIX = 'imgcdn_pk_';
const SECRET_KEY_PREFIX = 'imgcdn_sk_';
const BASE62_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Generate a cryptographically secure base62 string
 */
function generateBase62(length: number): string {
  const bytes = randomBytes(length);
  let result = '';

  for (let i = 0; i < length; i++) {
    result += BASE62_CHARS[bytes[i] % 62];
  }

  return result;
}

/**
 * Generate a new API key pair
 */
export function generateApiKeyPair(): {
  publicKey: string;
  secretKey: string;
  secretKeyHash: string;
} {
  const publicKey = `${PUBLIC_KEY_PREFIX}${generateBase62(22)}`;
  const secretKey = `${SECRET_KEY_PREFIX}${generateBase62(32)}`;
  const secretKeyHash = hashSecretKey(secretKey);

  return {
    publicKey,
    secretKey,
    secretKeyHash,
  };
}

/**
 * Generate only a public key (for regeneration scenarios)
 */
export function generatePublicKey(): string {
  return `${PUBLIC_KEY_PREFIX}${generateBase62(22)}`;
}

/**
 * Generate only a secret key (for regeneration scenarios)
 */
export function generateSecretKey(): string {
  return `${SECRET_KEY_PREFIX}${generateBase62(32)}`;
}

/**
 * Hash a secret key for storage
 * We use SHA-256 for fast verification while still being secure
 */
export function hashSecretKey(secretKey: string): string {
  return createHash('sha256').update(secretKey).digest('hex');
}

/**
 * Verify a secret key against its hash
 */
export function verifySecretKey(secretKey: string, hash: string): boolean {
  const inputHash = hashSecretKey(secretKey);

  // Use timing-safe comparison to prevent timing attacks
  try {
    return timingSafeEqual(Buffer.from(inputHash), Buffer.from(hash));
  } catch {
    return false;
  }
}

/**
 * Validate public key format
 */
export function isValidPublicKey(key: string): boolean {
  if (!key.startsWith(PUBLIC_KEY_PREFIX)) {
    return false;
  }

  const keyPart = key.slice(PUBLIC_KEY_PREFIX.length);

  if (keyPart.length !== 22) {
    return false;
  }

  return /^[0-9A-Za-z]+$/.test(keyPart);
}

/**
 * Validate secret key format
 */
export function isValidSecretKey(key: string): boolean {
  if (!key.startsWith(SECRET_KEY_PREFIX)) {
    return false;
  }

  const keyPart = key.slice(SECRET_KEY_PREFIX.length);

  if (keyPart.length !== 32) {
    return false;
  }

  return /^[0-9A-Za-z]+$/.test(keyPart);
}

/**
 * Mask a key for safe display (shows first and last 4 chars)
 */
export function maskKey(key: string): string {
  if (key.length <= 12) {
    return '****';
  }

  const prefix = key.slice(0, key.indexOf('_') + 4);
  const suffix = key.slice(-4);

  return `${prefix}****${suffix}`;
}

/**
 * Extract key type from key string
 */
export function getKeyType(key: string): 'public' | 'secret' | 'unknown' {
  if (key.startsWith(PUBLIC_KEY_PREFIX)) {
    return 'public';
  }

  if (key.startsWith(SECRET_KEY_PREFIX)) {
    return 'secret';
  }

  return 'unknown';
}

/**
 * Generate a signing key for HMAC operations
 * This is derived from the secret key for additional security
 */
export function deriveSigningKey(secretKey: string): string {
  return createHash('sha256')
    .update(`imagecdn:signing:${secretKey}`)
    .digest('hex');
}

/**
 * Generate a webhook signing secret
 */
export function generateWebhookSecret(): string {
  return `whsec_${generateBase62(32)}`;
}

/**
 * Verify a webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  timestamp: number,
  tolerance: number = 300 // 5 minutes
): boolean {
  // Check timestamp is within tolerance
  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - timestamp) > tolerance) {
    return false;
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`;
  const expectedSignature = createHash('sha256')
    .update(`${signedPayload}${secret}`)
    .digest('hex');

  // Timing-safe comparison
  try {
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

/**
 * Generate a short-lived token for one-time operations
 */
export function generateOneTimeToken(expirySeconds: number = 3600): {
  token: string;
  expiresAt: Date;
} {
  const token = generateBase62(48);
  const expiresAt = new Date(Date.now() + expirySeconds * 1000);

  return { token, expiresAt };
}
