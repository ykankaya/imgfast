import type { RequestContext, TransformParams } from '../types';

interface TransformResult {
  buffer: ArrayBuffer;
  contentType: string;
}

/**
 * Transform image using local server (development) or Cloudflare Image Resizing (production).
 * Supports resize, compress, format conversion, and effects.
 */
export async function transformImage(
  originalBuffer: ArrayBuffer,
  originalContentType: string,
  params: TransformParams,
  context: RequestContext
): Promise<TransformResult> {
  const { request, env, customer } = context;

  // Determine output format
  const outputFormat = determineOutputFormat(params.format, request, customer!);
  const outputContentType = getContentType(outputFormat);

  // Map our fit values to Cloudflare's supported values
  const fitMap: Record<string, 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad'> = {
    cover: 'cover',
    contain: 'contain',
    fill: 'cover',
    inside: 'contain',
    outside: 'cover',
  };

  // Map our gravity values to Cloudflare's supported values
  const gravityMap: Record<string, 'auto' | 'center' | 'left' | 'right' | 'top' | 'bottom'> = {
    center: 'center',
    north: 'top',
    south: 'bottom',
    east: 'right',
    west: 'left',
    auto: 'auto',
  };

  // Build Cloudflare image transform options
  const cfOptions: RequestInitCfPropertiesImage = {
    fit: fitMap[params.fit || 'cover'] || 'cover',
    gravity: gravityMap[params.gravity || 'center'] || 'center',
    quality: params.quality || parseInt(env.DEFAULT_QUALITY),
    format: outputFormat,
  };

  if (params.width) cfOptions.width = params.width;
  if (params.height) cfOptions.height = params.height;
  if (params.blur) cfOptions.blur = params.blur;
  if (params.sharpen) cfOptions.sharpen = params.sharpen;
  if (params.brightness) cfOptions.brightness = params.brightness;
  if (params.contrast) cfOptions.contrast = params.contrast;

  // In development mode, use local transform server
  if (env.ENVIRONMENT === 'development') {
    return transformWithLocalServer(originalBuffer, params, outputFormat, env);
  }

  // For Cloudflare Image Resizing, we need to make a subrequest
  // In production, this uses Cloudflare's edge image processing
  try {
    const transformedResponse = await fetch(request.url, {
      method: 'GET',
      cf: {
        image: cfOptions,
      },
    });

    if (transformedResponse.ok) {
      const transformedBuffer = await transformedResponse.arrayBuffer();
      return {
        buffer: transformedBuffer,
        contentType: transformedResponse.headers.get('content-type') || outputContentType,
      };
    }
  } catch (error) {
    console.warn('Cloudflare image transform failed, using fallback:', error);
  }

  // Fallback: return original image
  return {
    buffer: originalBuffer,
    contentType: originalContentType,
  };
}

function determineOutputFormat(
  requestedFormat: TransformParams['format'],
  request: Request,
  customer: { features: { avifSupport: boolean } }
): 'webp' | 'avif' | 'jpeg' | 'png' {
  if (requestedFormat && requestedFormat !== 'auto') {
    if (requestedFormat === 'avif' && !customer.features.avifSupport) {
      return 'webp';
    }
    return requestedFormat;
  }

  const accept = request.headers.get('accept') || '';

  if (customer.features.avifSupport && accept.includes('image/avif')) {
    return 'avif';
  }

  if (accept.includes('image/webp')) {
    return 'webp';
  }

  return 'jpeg';
}

function getContentType(format: string): string {
  const contentTypes: Record<string, string> = {
    webp: 'image/webp',
    avif: 'image/avif',
    jpeg: 'image/jpeg',
    png: 'image/png',
  };
  return contentTypes[format] || 'image/jpeg';
}

/**
 * Transform image using local Sharp server (for development/local testing)
 * Calls a separate Node.js server running Sharp for image processing
 */
async function transformWithLocalServer(
  originalBuffer: ArrayBuffer,
  params: TransformParams,
  outputFormat: 'webp' | 'avif' | 'jpeg' | 'png',
  env: { DEFAULT_QUALITY: string }
): Promise<TransformResult> {
  const TRANSFORM_SERVER = 'http://127.0.0.1:3002/transform';

  try {
    // Build query params
    const queryParams = new URLSearchParams();
    if (params.width) queryParams.set('w', String(params.width));
    if (params.height) queryParams.set('h', String(params.height));
    queryParams.set('q', String(params.quality || env.DEFAULT_QUALITY || 80));
    queryParams.set('f', outputFormat);
    if (params.fit) queryParams.set('fit', params.fit);
    if (params.blur) queryParams.set('blur', String(params.blur));
    if (params.sharpen) queryParams.set('sharpen', String(params.sharpen));

    const response = await fetch(`${TRANSFORM_SERVER}?${queryParams}`, {
      method: 'POST',
      body: originalBuffer,
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    });

    if (response.ok) {
      const transformedBuffer = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') || `image/${outputFormat}`;

      console.log(`Transformed via local server: ${transformedBuffer.byteLength} bytes`);

      return {
        buffer: transformedBuffer,
        contentType,
      };
    }

    console.warn('Local transform server error:', response.status);
  } catch (error) {
    console.warn('Local transform server not available, returning original:', error);
  }

  // Fallback: return original
  return {
    buffer: originalBuffer,
    contentType: `image/${outputFormat}`,
  };
}
