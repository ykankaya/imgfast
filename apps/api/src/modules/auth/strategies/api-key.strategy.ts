import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';

@Injectable()
export class ApiKeyStrategy extends PassportStrategy(Strategy, 'api-key') {
  constructor() {
    super();
  }

  async validate(request: any): Promise<any> {
    const apiKey = request.headers['x-api-key'];

    if (!apiKey) {
      throw new UnauthorizedException('API key is required');
    }

    // In production, look up the API key in database
    // and return the associated customer

    if (!apiKey.startsWith('imgcdn_sk_')) {
      throw new UnauthorizedException('Invalid API key format');
    }

    // Placeholder: return mock customer
    return {
      customerId: 'customer-from-api-key',
      publicKey: 'imgcdn_pk_mock',
    };
  }
}
