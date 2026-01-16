import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';

// PrismaClient will be available after running `prisma generate`
// For now, we create a placeholder that will work without the generated client

let PrismaClient: any;
try {
  // Dynamic import to avoid build errors when client is not generated
  PrismaClient = require('@prisma/client').PrismaClient;
} catch {
  // Prisma client not generated yet - use a mock
  PrismaClient = class MockPrismaClient {
    async $connect() {
      console.warn('Prisma client not generated. Run: pnpm db:generate');
    }
    async $disconnect() {}
  };
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
    } catch (error) {
      console.error('Failed to connect to database:', error);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
