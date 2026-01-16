import type { Env, TransformParams, Customer } from '../types';

/**
 * Parse URL query parameters into typed transform params.
 */
export function parseTransformParams(
  params: Record<string, string>,
  env: Env
): TransformParams {
  const result: TransformParams = {};

  // Dimensions
  if (params.w || params.width) {
    result.width = parseInt(params.w || params.width);
  }
  if (params.h || params.height) {
    result.height = parseInt(params.h || params.height);
  }

  // Quality (1-100)
  if (params.q || params.quality) {
    result.quality = Math.min(100, Math.max(1, parseInt(params.q || params.quality)));
  }

  // Format
  if (params.f || params.format) {
    const format = (params.f || params.format).toLowerCase();
    if (['auto', 'webp', 'avif', 'jpeg', 'jpg', 'png'].includes(format)) {
      result.format = format === 'jpg' ? 'jpeg' : (format as TransformParams['format']);
    }
  }

  // Fit mode
  if (params.fit) {
    const fit = params.fit.toLowerCase();
    if (['cover', 'contain', 'fill', 'inside', 'outside'].includes(fit)) {
      result.fit = fit as TransformParams['fit'];
    }
  }

  // Gravity (focal point)
  if (params.g || params.gravity) {
    const gravity = (params.g || params.gravity).toLowerCase();
    if (['center', 'north', 'south', 'east', 'west', 'auto'].includes(gravity)) {
      result.gravity = gravity as TransformParams['gravity'];
    }
  }

  // Effects
  if (params.blur) {
    result.blur = Math.min(250, Math.max(0, parseInt(params.blur)));
  }
  if (params.sharpen) {
    result.sharpen = Math.min(10, Math.max(0, parseFloat(params.sharpen)));
  }
  if (params.brightness) {
    result.brightness = Math.min(2, Math.max(0, parseFloat(params.brightness)));
  }
  if (params.contrast) {
    result.contrast = Math.min(2, Math.max(0, parseFloat(params.contrast)));
  }

  return result;
}

/**
 * Validate transform params against customer limits.
 */
export function validateTransformParams(
  params: TransformParams,
  customer: Customer
): { valid: boolean; message: string } {
  const { limits, features } = customer;

  // Check dimensions
  if (params.width && params.width > limits.maxImageWidth) {
    return {
      valid: false,
      message: `Width exceeds maximum (${limits.maxImageWidth}px)`,
    };
  }

  if (params.height && params.height > limits.maxImageHeight) {
    return {
      valid: false,
      message: `Height exceeds maximum (${limits.maxImageHeight}px)`,
    };
  }

  // Minimum dimensions
  if (params.width && params.width < 1) {
    return { valid: false, message: 'Width must be at least 1px' };
  }

  if (params.height && params.height < 1) {
    return { valid: false, message: 'Height must be at least 1px' };
  }

  // AVIF format check
  if (params.format === 'avif' && !features.avifSupport) {
    return {
      valid: false,
      message: 'AVIF format not available on your plan',
    };
  }

  return { valid: true, message: 'OK' };
}

/**
 * Normalize params for consistent cache keys.
 */
export function normalizeParams(params: TransformParams): TransformParams {
  const normalized: TransformParams = {};

  // Only include non-default values
  if (params.width) normalized.width = params.width;
  if (params.height) normalized.height = params.height;
  if (params.quality && params.quality !== 80) normalized.quality = params.quality;
  if (params.format && params.format !== 'auto') normalized.format = params.format;
  if (params.fit && params.fit !== 'cover') normalized.fit = params.fit;
  if (params.gravity && params.gravity !== 'center') normalized.gravity = params.gravity;
  if (params.blur) normalized.blur = params.blur;
  if (params.sharpen) normalized.sharpen = params.sharpen;
  if (params.brightness && params.brightness !== 1) normalized.brightness = params.brightness;
  if (params.contrast && params.contrast !== 1) normalized.contrast = params.contrast;

  return normalized;
}
