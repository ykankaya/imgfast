/**
 * Shared utility functions for ImageCDN platform
 */

// Formatting utilities
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toString();
}

export function formatPercent(value: number, total: number): string {
  if (total === 0) return '0%';
  return `${((value / total) * 100).toFixed(1)}%`;
}

// Date utilities
export function getMonthKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

// Hash utilities
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// URL utilities
export function parseImageUrl(url: string): {
  publicKey: string;
  imagePath: string;
  params: Record<string, string>;
} | null {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);

    if (pathParts.length < 2) return null;

    const [publicKey, ...imageParts] = pathParts;
    const imagePath = imageParts.join('/');
    const params = Object.fromEntries(urlObj.searchParams);

    return { publicKey, imagePath, params };
  } catch {
    return null;
  }
}

export function buildCdnUrl(
  baseUrl: string,
  publicKey: string,
  imagePath: string,
  params?: Record<string, string | number>
): string {
  const url = new URL(`${baseUrl}/${publicKey}/${imagePath}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url.toString();
}

// Validation utilities
export function isValidPublicKey(key: string): boolean {
  return /^imgfast_pk_[a-zA-Z0-9]{8,16}$/.test(key);
}

export function isValidSecretKey(key: string): boolean {
  return /^imgfast_sk_[a-zA-Z0-9]{24,40}$/.test(key);
}

export function isValidDomain(domain: string): boolean {
  // Supports wildcards like *.example.com
  const pattern = /^(\*\.)?[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;
  return pattern.test(domain);
}

export function isValidImageFormat(format: string): boolean {
  return ['jpeg', 'jpg', 'png', 'webp', 'avif', 'gif', 'auto'].includes(format.toLowerCase());
}

// Domain matching
export function matchesDomain(hostname: string, pattern: string): boolean {
  if (pattern.startsWith('*.')) {
    const baseDomain = pattern.slice(2);
    return hostname === baseDomain || hostname.endsWith(`.${baseDomain}`);
  }
  return hostname === pattern;
}

// Safe JSON parsing
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

// Retry utility
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; delayMs?: number } = {}
): Promise<T> {
  const { maxRetries = 3, delayMs = 1000 } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
      }
    }
  }

  throw lastError;
}

// Rate limiting helper
export function createRateLimiter(limit: number, windowMs: number) {
  const requests: number[] = [];

  return {
    check(): boolean {
      const now = Date.now();
      const windowStart = now - windowMs;

      // Remove old requests
      while (requests.length > 0 && requests[0] < windowStart) {
        requests.shift();
      }

      return requests.length < limit;
    },

    record(): void {
      requests.push(Date.now());
    },

    remaining(): number {
      const now = Date.now();
      const windowStart = now - windowMs;

      while (requests.length > 0 && requests[0] < windowStart) {
        requests.shift();
      }

      return Math.max(0, limit - requests.length);
    },
  };
}
