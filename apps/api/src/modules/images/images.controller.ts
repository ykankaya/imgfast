import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ImagesService } from './images.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Images')
@Controller({ path: 'images', version: '1' })
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  @Post('upload-url')
  @ApiOperation({ summary: 'Get presigned URL for image upload' })
  async getUploadUrl(
    @CurrentUser() user: any,
    @Body() body: { filename: string; contentType: string }
  ) {
    // In production, get publicKey from customer record
    const publicKey = user.publicKey || 'imgfast_pk_demo';
    return this.imagesService.getUploadUrl(publicKey, body.filename, body.contentType);
  }

  @Get()
  @ApiOperation({ summary: 'List uploaded images' })
  async listImages(
    @CurrentUser() user: any,
    @Query('prefix') prefix?: string,
    @Query('limit') limit?: number,
    @Query('token') token?: string
  ) {
    const publicKey = user.publicKey || 'imgfast_pk_demo';
    return this.imagesService.listImages(publicKey, {
      prefix,
      maxKeys: limit,
      continuationToken: token,
    });
  }

  @Delete(':imagePath')
  @ApiOperation({ summary: 'Delete an image' })
  async deleteImage(@CurrentUser() user: any, @Param('imagePath') imagePath: string) {
    const publicKey = user.publicKey || 'imgfast_pk_demo';
    await this.imagesService.deleteImage(publicKey, imagePath);
    return { success: true };
  }

  @Get('cdn-url/:imagePath')
  @ApiOperation({ summary: 'Get CDN URL for an image' })
  getCdnUrl(
    @CurrentUser() user: any,
    @Param('imagePath') imagePath: string,
    @Query() params: Record<string, string>
  ) {
    const publicKey = user.publicKey || 'imgfast_pk_demo';
    const { path, ...transformParams } = params;
    return {
      url: this.imagesService.getCdnUrl(publicKey, imagePath, transformParams),
    };
  }
}
