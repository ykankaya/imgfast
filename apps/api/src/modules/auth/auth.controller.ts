import { Controller, Post, Body, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@ApiTags('Auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Login with email and password' })
  async login(@Body() body: { email: string; password: string }) {
    // In production, validate credentials against database
    // This is a placeholder for the authentication flow

    const payload = {
      sub: 'user-id',
      email: body.email,
      customerId: 'customer-id',
    };

    return {
      accessToken: this.authService.generateToken(payload),
      expiresIn: '7d',
    };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user info' })
  getProfile(@CurrentUser() user: any) {
    return user;
  }

  @Post('api-keys/generate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Generate new API key pair' })
  generateApiKeys(@CurrentUser() user: any) {
    const keys = this.authService.generateApiKeyPair();

    // In production, store the hashed secret key in database
    // and return the plain secret key only once

    return {
      publicKey: keys.publicKey,
      secretKey: keys.secretKey,
      warning: 'Store the secret key securely. It will not be shown again.',
    };
  }
}
