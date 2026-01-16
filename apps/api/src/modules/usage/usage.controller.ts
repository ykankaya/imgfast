import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UsageService } from './usage.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Usage')
@Controller({ path: 'usage', version: '1' })
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsageController {
  constructor(private readonly usageService: UsageService) {}

  @Get('current')
  @ApiOperation({ summary: 'Get current billing period usage' })
  async getCurrentUsage(@CurrentUser() user: any) {
    return this.usageService.getCurrentUsage(user.customerId);
  }

  @Get('details')
  @ApiOperation({ summary: 'Get detailed usage breakdown' })
  async getUsageDetails(
    @CurrentUser() user: any,
    @Query('start') start: string,
    @Query('end') end: string
  ) {
    const startDate = start ? new Date(start) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = end ? new Date(end) : new Date();
    return this.usageService.getUsageDetails(user.customerId, startDate, endDate);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get usage history for past months' })
  async getUsageHistory(
    @CurrentUser() user: any,
    @Query('months') months?: number
  ) {
    return this.usageService.getUsageHistory(user.customerId, months || 6);
  }

  @Get('quota')
  @ApiOperation({ summary: 'Check current quota status' })
  async checkQuota(@CurrentUser() user: any) {
    // In production, get limits from customer's plan
    const limits = {
      requests: 100000,
      bandwidth: 10 * 1024 * 1024 * 1024, // 10 GB
    };
    return this.usageService.checkQuota(user.customerId, limits);
  }
}
