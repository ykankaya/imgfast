/**
 * Local Image Transform Server using Sharp
 * Provides TinyPNG-like compression for development testing
 *
 * Run: node transform-server.js
 * Endpoint: POST http://localhost:3002/transform?w=800&h=600&q=80&f=webp
 */

const http = require('http');
const sharp = require('sharp');

const PORT = 3002;

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST' || !req.url.startsWith('/transform')) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  try {
    // Parse query params
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const params = {
      width: url.searchParams.get('w') ? parseInt(url.searchParams.get('w')) : undefined,
      height: url.searchParams.get('h') ? parseInt(url.searchParams.get('h')) : undefined,
      quality: parseInt(url.searchParams.get('q') || '80'),
      format: url.searchParams.get('f') || 'jpeg',
      fit: url.searchParams.get('fit') || 'cover',
      blur: url.searchParams.get('blur') ? parseFloat(url.searchParams.get('blur')) : undefined,
      sharpen: url.searchParams.get('sharpen') ? parseFloat(url.searchParams.get('sharpen')) : undefined,
    };

    // Read request body
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const inputBuffer = Buffer.concat(chunks);

    // Get original metadata
    const metadata = await sharp(inputBuffer).metadata();
    console.log(`\n📥 Input: ${metadata.width}x${metadata.height}, ${metadata.format}, ${inputBuffer.length} bytes`);

    // Build Sharp pipeline
    let pipeline = sharp(inputBuffer);

    // Resize
    if (params.width || params.height) {
      pipeline = pipeline.resize({
        width: params.width,
        height: params.height,
        fit: params.fit,
        position: 'center',
        withoutEnlargement: true,
      });
    }

    // Effects
    if (params.blur && params.blur > 0) {
      pipeline = pipeline.blur(Math.max(0.3, params.blur * 0.5));
    }
    if (params.sharpen && params.sharpen > 0) {
      pipeline = pipeline.sharpen(params.sharpen);
    }

    // Output format with TinyPNG-like compression
    let outputBuffer;
    let contentType;

    switch (params.format) {
      case 'webp':
        outputBuffer = await pipeline.webp({
          quality: params.quality,
          effort: 6,
          smartSubsample: true,
          nearLossless: params.quality > 90,
        }).toBuffer();
        contentType = 'image/webp';
        break;

      case 'avif':
        outputBuffer = await pipeline.avif({
          quality: params.quality,
          effort: 6,
          chromaSubsampling: '4:2:0',
        }).toBuffer();
        contentType = 'image/avif';
        break;

      case 'png':
        outputBuffer = await pipeline.png({
          compressionLevel: 9,
          palette: true,
          quality: params.quality,
          effort: 10,
        }).toBuffer();
        contentType = 'image/png';
        break;

      case 'jpeg':
      default:
        outputBuffer = await pipeline.jpeg({
          quality: params.quality,
          progressive: true,
          mozjpeg: true,
          optimizeCoding: true,
          trellisQuantisation: true,
          overshootDeringing: true,
          optimizeScans: true,
        }).toBuffer();
        contentType = 'image/jpeg';
        break;
    }

    // Get output metadata
    const outputMetadata = await sharp(outputBuffer).metadata();
    const savedPercent = ((1 - outputBuffer.length / inputBuffer.length) * 100).toFixed(1);
    const savedBytes = inputBuffer.length - outputBuffer.length;

    console.log(`📤 Output: ${outputMetadata.width}x${outputMetadata.height}, ${params.format}, ${outputBuffer.length} bytes`);
    console.log(`✨ Saved: ${savedBytes} bytes (${savedPercent}% smaller)`);

    // Send response
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': outputBuffer.length,
      'X-Original-Size': inputBuffer.length,
      'X-Compressed-Size': outputBuffer.length,
      'X-Compression-Ratio': savedPercent,
    });
    res.end(outputBuffer);

  } catch (error) {
    console.error('Transform error:', error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
});

server.listen(PORT, () => {
  console.log(`
🖼️  Image Transform Server (Sharp + TinyPNG-like compression)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📍 Running on: http://localhost:${PORT}
📝 Endpoint:   POST /transform?w=800&h=600&q=80&f=webp

Supported parameters:
  • w      - Width (px)
  • h      - Height (px)
  • q      - Quality (1-100, default: 80)
  • f      - Format (jpeg, webp, avif, png)
  • fit    - Resize fit (cover, contain, fill, inside, outside)
  • blur   - Blur amount (0-100)
  • sharpen - Sharpen amount

Ready for requests...
  `);
});
