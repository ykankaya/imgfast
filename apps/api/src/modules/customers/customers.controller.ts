import { Controller, Get, Put, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Customers')
@Controller({ path: 'customers', version: '1' })
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current customer profile' })
  async getProfile(@CurrentUser() user: any) {
    const customer = await this.customersService.findById(user.customerId);
    if (!customer) {
      return null;
    }

    // Don't expose sensitive data
    const { secretKeyHash, ...safeCustomer } = customer;
    return safeCustomer;
  }

  @Put('me/domains')
  @ApiOperation({ summary: 'Update allowed domains' })
  async updateDomains(
    @CurrentUser() user: any,
    @Body() body: { domains: string[] }
  ) {
    return this.customersService.update(user.customerId, {
      allowedDomains: body.domains,
    });
  }

  @Put('me/referrers')
  @ApiOperation({ summary: 'Update allowed referrers' })
  async updateReferrers(
    @CurrentUser() user: any,
    @Body() body: { referrers: string[] }
  ) {
    return this.customersService.update(user.customerId, {
      allowedReferrers: body.referrers,
    });
  }
}
