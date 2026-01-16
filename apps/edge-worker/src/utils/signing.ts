/**
 * URL Signing Utilities
 *
 * Provides functions for generating and verifying signed URLs
 * for secure image access. Used by the auth middleware and
 * exposed for SDK implementations.
 */

/**
 * Configuration for signed URL generation
 */
export interface SigningConfig {
  /** Customer's secret key */
  secretKey: string;
  /** Default expiry in milliseconds (default: 1 hour) */
  defaultExpiryMs?: number;
  /** Maximum allowed expiry in milliseconds (default: 24 hours) */
  maxExpiryMs?: number;
}

/**
 * Parameters for URL generation
 */
export interface SignedUrlParams {
  /** Base CDN URL (e.g., https://cdn.imagecdn.io) */
  baseUrl: string;
  /** Customer's public key */
  publicKey: string;
  /** Path to the image */
  imagePath: string;
  /** Transformation parameters */
  transformParams?: TransformOptions;
  /** Custom expiry in milliseconds */
  expiryMs?: number;
}

/**
 * Transformation options that can be signed
 */
export interface TransformOptions {
  w?: number;       // width
  h?: number;       // height
  q?: number;       // quality
  f?: string;       // format
  fit?: string;     // fit mode
  g?: string;       // gravity
  blur?: number;    // blur amount
  sharp?: number;   // sharpen amount
  [key: string]: string | number | undefined;
}

/**
 * Generate a signed URL for secure image access
 */
export async function createSignedUrl(
  params: SignedUrlParams,
  config: SigningConfig
): Promise<string> {
  const {
    baseUrl,
    publicKey,
    imagePath,
    transformParams = {},
    expiryMs = config.defaultExpiryMs || 3600000, // 1 hour default
  } = params;

  const { secretKey, maxExpiryMs = 86400000 } = config; // 24 hours max

  // Validate expiry
  if (expiryMs > maxExpiryMs) {
    throw new Error(`Expiry exceeds maximum allowed (${maxExpiryMs}ms)`);
  }

  const expiry = Date.now() + expiryMs;

  // Build query parameters
  const queryParams: Record<string, string> = {};

  // Add transform parameters
  for (const [key, value] of Object.entries(transformParams)) {
    if (value !== undefined) {
      queryParams[key] = String(value);
    }
  }

  // Add expiry
  queryParams.exp = String(expiry);

  // Sort parameters for consistent signing
  const sortedKeys = Object.keys(queryParams).sort();
  const paramString = sortedKeys.map(key => `${key}=${queryParams[key]}`).join('&');

  // Generate string to sign
  const stringToSign = `${publicKey}/${imagePath}?${paramString}`;

  // Create signature
  const signature = await hmacSign(stringToSign, secretKey);

  // Build final URL
  const cleanPath = imagePath.startsWith('/') ? imagePath.slice(1) : imagePath;
  return `${baseUrl}/${publicKey}/${cleanPath}?${paramString}&sig=${signature}`;
}

/**
 * Verify a signed URL
 */
export async function verifySignedUrl(
  url: string,
  secretKey: string
): Promise<{ valid: boolean; reason?: string }> {
  try {
    const parsedUrl = new URL(url);
    const pathParts = parsedUrl.pathname.split('/').filter(Boolean);

    if (pathParts.length < 2) {
      return { valid: false, reason: 'Invalid URL format' };
    }

    const [publicKey, ...imageParts] = pathParts;
    const imagePath = imageParts.join('/');

    const params = Object.fromEntries(parsedUrl.searchParams);

    // Extract signature
    const signature = params.sig || params.signature;
    if (!signature) {
      return { valid: false, reason: 'Missing signature' };
    }

    // Check expiry
    const expiry = params.exp || params.expires;
    if (!expiry) {
      return { valid: false, reason: 'Missing expiry' };
    }

    const expiryTime = parseInt(expiry, 10);
    if (isNaN(expiryTime)) {
      return { valid: false, reason: 'Invalid expiry format' };
    }

    if (expiryTime < Date.now()) {
      return { valid: false, reason: 'URL has expired' };
    }

    // Rebuild string to sign (excluding signature)
    const paramsToSign: string[] = [];
    for (const [key, value] of Object.entries(params)) {
      if (key !== 'sig' && key !== 'signature') {
        paramsToSign.push(`${key}=${value}`);
      }
    }
    paramsToSign.sort();

    const stringToSign = `${publicKey}/${imagePath}?${paramsToSign.join('&')}`;
    const expectedSignature = await hmacSign(stringToSign, secretKey);

    // Constant-time comparison
    if (!secureCompare(signature, expectedSignature)) {
      return { valid: false, reason: 'Invalid signature' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, reason: 'URL parsing error' };
  }
}

/**
 * Generate HMAC-SHA256 signature
 */
export async function hmacSign(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(message);

  // Import key for HMAC
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // Sign the message
  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);

  // Convert to URL-safe base64
  return arrayBufferToBase64Url(signatureBuffer);
}

/**
 * Convert ArrayBuffer to URL-safe base64
 */
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Parse transformation parameters from URL query string
 */
export function parseTransformParams(searchParams: URLSearchParams): TransformOptions {
  const params: TransformOptions = {};

  // Map common short names to full names
  const paramMap: Record<string, keyof TransformOptions> = {
    w: 'w',
    width: 'w',
    h: 'h',
    height: 'h',
    q: 'q',
    quality: 'q',
    f: 'f',
    format: 'f',
    fit: 'fit',
    g: 'g',
    gravity: 'g',
  };

  for (const [key, fullKey] of Object.entries(paramMap)) {
    const value = searchParams.get(key);
    if (value !== null) {
      // Parse numeric values
      if (['w', 'h', 'q', 'blur', 'sharp'].includes(fullKey)) {
        const numValue = parseInt(value, 10);
        if (!isNaN(numValue)) {
          params[fullKey] = numValue;
        }
      } else {
        params[fullKey] = value;
      }
    }
  }

  return params;
}

/**
 * Generate a short-lived token for API authentication
 * Used for dashboard/API requests, not URL signing
 */
export async function generateApiToken(
  customerId: string,
  secretKey: string,
  expiryMinutes: number = 60
): Promise<string> {
  const payload = {
    sub: customerId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (expiryMinutes * 60),
    type: 'api',
  };

  const payloadString = JSON.stringify(payload);
  const payloadBase64 = btoa(payloadString)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const signature = await hmacSign(payloadBase64, secretKey);

  return `${payloadBase64}.${signature}`;
}

/**
 * Verify an API token
 */
export async function verifyApiToken(
  token: string,
  secretKey: string
): Promise<{ valid: boolean; customerId?: string; reason?: string }> {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) {
      return { valid: false, reason: 'Invalid token format' };
    }

    const [payloadBase64, signature] = parts;

    // Verify signature
    const expectedSignature = await hmacSign(payloadBase64, secretKey);
    if (!secureCompare(signature, expectedSignature)) {
      return { valid: false, reason: 'Invalid signature' };
    }

    // Decode payload
    const payloadString = atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadString);

    // Check expiry
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return { valid: false, reason: 'Token expired' };
    }

    // Check type
    if (payload.type !== 'api') {
      return { valid: false, reason: 'Invalid token type' };
    }

    return { valid: true, customerId: payload.sub };
  } catch (error) {
    return { valid: false, reason: 'Token parsing error' };
  }
}
