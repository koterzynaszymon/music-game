import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants.js';
import { RoomsRepository } from './rooms.repository.js';
import { RoomSerializer } from './room.serializer.js';
import { Room } from './room.model.js';
import { KeyedLock } from './keyed-lock.js';

const ROOM_TTL_SECONDS = 60 * 60; // 1 hour

@Injectable()
export class RedisRoomsRepository extends RoomsRepository {
  // Every write to a room waits its turn here, so two updates of the same room can never interleave (read A, read B, save A, save B -> A's change lost).
  private readonly lock = new KeyedLock();

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {
    super();
  }

  // One place that decides the key name, so the methods can't disagree.
  // The "room:" prefix keeps rooms apart from any other data in Redis.
  private key(code: string): string {
    return `room:${code}`;
  }


  private async read(code: string): Promise<Room | undefined> {
    const serialized = await this.redis.get(this.key(code));
    if (!serialized) return undefined;
    return RoomSerializer.deserialize(serialized);
  }

  private async write(room: Room): Promise<void> {
    await this.redis.set(this.key(room.code), RoomSerializer.serialize(room), 'EX', ROOM_TTL_SECONDS);
  }

  async findRoom(code: string): Promise<Room | undefined> {
    return this.read(code);
  }

  async saveRoom(room: Room): Promise<void> {
    await this.lock.run(room.code, () => this.write(room));
  }

  async deleteRoom(code: string): Promise<void> {
    await this.lock.run(code, async () => {
      await this.redis.del(this.key(code));
    });
  }

  async updateRoom<T>(code: string, change: (room: Room | undefined) => T): Promise<T> {
    return this.lock.run(code, async () => {
      const room = await this.read(code);
      const result = change(room); // throws -> we never reach write()
      if (room) {
        await this.write(room);
      }
      return result;
    });
  }
}
