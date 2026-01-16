import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Health check endpoint' })
  check() {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0',
    };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness check' })
  ready() {
    // Add database/external service checks here
    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
    };
  }
}
