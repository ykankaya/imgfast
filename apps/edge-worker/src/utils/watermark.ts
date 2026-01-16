import type { Customer, TransformParams } from '../types';

/**
 * Determine if watermark should be added based on customer plan.
 * Free tier images get watermarked unless they've upgraded.
 */
export function shouldAddWatermark(
  customer: Customer,
  params: TransformParams
): boolean {
  // If customer has watermark removal feature, skip
  if (customer.features.removeWatermark) {
    return false;
  }

  // Free tier always gets watermark
  if (customer.plan.tier === 'free') {
    return true;
  }

  // Explicit watermark request (for preview purposes)
  if (params.watermark === true) {
    return true;
  }

  return false;
}

/**
 * Get watermark configuration based on image dimensions.
 */
export function getWatermarkConfig(
  imageWidth: number,
  imageHeight: number
): WatermarkConfig {
  // Scale watermark based on image size
  const minDimension = Math.min(imageWidth, imageHeight);

  // Small images get smaller watermark
  if (minDimension < 300) {
    return {
      text: 'ImageCDN',
      fontSize: 12,
      opacity: 0.3,
      position: 'bottom-right',
      padding: 5,
    };
  }

  // Medium images
  if (minDimension < 800) {
    return {
      text: 'ImageCDN.io',
      fontSize: 16,
      opacity: 0.4,
      position: 'bottom-right',
      padding: 10,
    };
  }

  // Large images
  return {
    text: 'Powered by ImageCDN.io',
    fontSize: 20,
    opacity: 0.5,
    position: 'bottom-right',
    padding: 15,
  };
}

interface WatermarkConfig {
  text: string;
  fontSize: number;
  opacity: number;
  position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center';
  padding: number;
}

/**
 * Apply watermark to image buffer.
 * Note: Actual implementation would use Canvas API or WASM library.
 * This is a placeholder showing the interface.
 */
export async function applyWatermark(
  imageBuffer: ArrayBuffer,
  config: WatermarkConfig
): Promise<ArrayBuffer> {
  // In production, this would:
  // 1. Decode the image
  // 2. Draw the watermark text
  // 3. Re-encode the image
  //
  // Options for Cloudflare Workers:
  // - Use @cloudflare/workers-types with Canvas API (experimental)
  // - Use a WASM-based image library
  // - Call an external watermarking service
  //
  // For MVP, watermarking could be done at upload time instead

  console.log('Watermark would be applied:', config);
  return imageBuffer;
}
