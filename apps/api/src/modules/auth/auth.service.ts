import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';

export interface JwtPayload {
  sub: string;
  email: string;
  customerId: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  /**
   * Generate JWT token for dashboard access.
   */
  generateToken(payload: JwtPayload): string {
    return this.jwtService.sign(payload);
  }

  /**
   * Verify JWT token.
   */
  verifyToken(token: string): JwtPayload {
    try {
      return this.jwtService.verify<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  /**
   * Generate API key pair for customer.
   * Public key is used in CDN URLs.
   * Secret key is used for API authentication.
   */
  generateApiKeyPair(): { publicKey: string; secretKey: string } {
    // Public key: short, URL-safe identifier
    const publicKey = this.generatePublicKey();

    // Secret key: longer, secure key for API access
    const secretKey = this.generateSecretKey();

    return { publicKey, secretKey };
  }

  /**
   * Generate a URL-safe public key.
   * Format: imgcdn_pk_[12 chars]
   */
  private generatePublicKey(): string {
    const randomPart = crypto.randomBytes(9).toString('base64url').slice(0, 12);
    return `imgcdn_pk_${randomPart}`;
  }

  /**
   * Generate a secure secret key.
   * Format: imgcdn_sk_[32 chars]
   */
  private generateSecretKey(): string {
    const randomPart = crypto.randomBytes(24).toString('base64url').slice(0, 32);
    return `imgcdn_sk_${randomPart}`;
  }

  /**
   * Hash secret key for storage.
   */
  hashSecretKey(secretKey: string): string {
    return crypto.createHash('sha256').update(secretKey).digest('hex');
  }

  /**
   * Verify secret key against stored hash.
   */
  verifySecretKey(secretKey: string, hash: string): boolean {
    const inputHash = this.hashSecretKey(secretKey);
    return crypto.timingSafeEqual(Buffer.from(inputHash), Buffer.from(hash));
  }

  /**
   * Generate signed URL for premium customers.
   */
  generateSignedUrl(
    baseUrl: string,
    publicKey: string,
    imagePath: string,
    params: Record<string, string>,
    expiresIn: number = 3600
  ): string {
    const expires = Math.floor(Date.now() / 1000) + expiresIn;
    const paramsString = new URLSearchParams({ ...params, expires: String(expires) }).toString();
    const signatureData = `${publicKey}/${imagePath}?${paramsString}`;

    // In production, use HMAC with customer's secret key
    const signature = crypto
      .createHmac('sha256', process.env.URL_SIGNING_SECRET || 'secret')
      .update(signatureData)
      .digest('hex')
      .slice(0, 16);

    return `${baseUrl}/${publicKey}/${imagePath}?${paramsString}&sig=${signature}`;
  }
}
