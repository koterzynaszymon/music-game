import { Module } from '@nestjs/common';
import { REDIS_CLIENT } from './redis.constants.js';
import { Redis } from 'ioredis';
import { Inject } from '@nestjs/common';
import { OnModuleDestroy } from '@nestjs/common';
@Module({
  controllers: [],
  providers: [
  {
    provide: REDIS_CLIENT,
    useFactory: () => new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379'),
  }
],
  exports: [REDIS_CLIENT], 
})
export class RedisModule implements OnModuleDestroy{
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}
  async onModuleDestroy() {
    await this.redis.quit();
  }
}