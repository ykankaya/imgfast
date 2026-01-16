import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class ImagesService {
  private s3Client: S3Client;
  private bucketName: string;

  constructor(private readonly configService: ConfigService) {
    // Configure for Cloudflare R2 (S3-compatible)
    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: this.configService.get<string>('R2_ENDPOINT'),
      credentials: {
        accessKeyId: this.configService.get<string>('R2_ACCESS_KEY_ID')!,
        secretAccessKey: this.configService.get<string>('R2_SECRET_ACCESS_KEY')!,
      },
    });
    this.bucketName = this.configService.get<string>('R2_BUCKET_NAME')!;
  }

  /**
   * Generate presigned URL for direct upload to R2.
   */
  async getUploadUrl(
    publicKey: string,
    filename: string,
    contentType: string
  ): Promise<{ uploadUrl: string; key: string }> {
    const key = `${publicKey}/${filename}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, {
      expiresIn: 3600, // 1 hour
    });

    return { uploadUrl, key };
  }

  /**
   * Delete an image from R2.
   */
  async deleteImage(publicKey: string, imagePath: string): Promise<void> {
    const key = `${publicKey}/${imagePath}`;

    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    await this.s3Client.send(command);
  }

  /**
   * List images for a customer.
   */
  async listImages(
    publicKey: string,
    options: { prefix?: string; maxKeys?: number; continuationToken?: string }
  ): Promise<{
    images: { key: string; size: number; lastModified: Date }[];
    nextToken?: string;
  }> {
    const command = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: options.prefix ? `${publicKey}/${options.prefix}` : `${publicKey}/`,
      MaxKeys: options.maxKeys || 100,
      ContinuationToken: options.continuationToken,
    });

    const response = await this.s3Client.send(command);

    return {
      images: (response.Contents || []).map(obj => ({
        key: obj.Key!.replace(`${publicKey}/`, ''),
        size: obj.Size!,
        lastModified: obj.LastModified!,
      })),
      nextToken: response.NextContinuationToken,
    };
  }

  /**
   * Get CDN URL for an image.
   */
  getCdnUrl(publicKey: string, imagePath: string, params?: Record<string, string>): string {
    const cdnBase = this.configService.get<string>('CDN_BASE_URL');
    const queryString = params ? `?${new URLSearchParams(params).toString()}` : '';
    return `${cdnBase}/${publicKey}/${imagePath}${queryString}`;
  }
}
