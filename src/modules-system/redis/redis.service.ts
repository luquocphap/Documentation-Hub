import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_URL } from 'src/common/constants/app.constant';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private redisClient!: Redis;

  async onModuleInit() {
    this.redisClient = new Redis(
      REDIS_URL as string
    );

    await this.redisClient.ping();
    console.log('[REDIS] Redis connected');
  }

  async onModuleDestroy() {
    await this.redisClient.quit();
  }

  getClient(): Redis {
    return this.redisClient;
  }
}