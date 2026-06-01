import { Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    try {
      await this.$connect();
      await this.$runCommandRaw({ ping: 1 });
      console.log('✅ Prisma connected to MongoDB successfully');
    } catch (error) {
      console.error('❌ Prisma connection error:', error);
    }
  }
}