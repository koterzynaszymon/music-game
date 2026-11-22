import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { Redis } from 'ioredis';
import { RedisRoomsRepository } from './redis-rooms.repository.js';
import { describeRoomsRepositoryContract, makeContractRoom } from './rooms-repository.contract.js';
import { RoomsService } from './rooms.service.js';
import { Shuffler } from './shuffler.js';
import { Clock } from './clock.js';

// INTEGRATION tests: they talk to a real Redis (the Docker container), so they
// are slower than unit tests and need it running. Run them with:
//   npm run test:integration
//
// They use database 1, not 0 (the one the app uses), because every test
// starts with FLUSHDB, which empties the whole database it is pointed at.
const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1';

const ONE_HOUR = 60 * 60;

let redis: Redis;

beforeAll(async () => {
  // maxRetriesPerRequest: 1 -> if Redis isn't running, fail fast with an
  // error instead of retrying for a long time and hitting the test timeout
  redis = new Redis(TEST_REDIS_URL, { maxRetriesPerRequest: 1 });
  await redis.ping();
});

beforeEach(async () => {
  await redis.flushdb(); // every test starts with an empty database
});

afterAll(async () => {
  await redis.quit(); // an open connection would keep Vitest from exiting
});

describe('RedisRoomsRepository', () => {
  // The same cases InMemoryRoomsRepository passes
  describeRoomsRepositoryContract(() => new RedisRoomsRepository(redis));

  // --- things only a real database does ---
  describe('how rooms are stored in Redis', () => {
    it('stores a room under the key room:{code}', async () => {
      // The prefix keeps rooms apart from any other data in Redis,
      // and lets you list them in redis-cli with: KEYS room:*
      await new RedisRoomsRepository(redis).saveRoom(makeContractRoom('abc'));
      expect(await redis.exists('room:abc')).toBe(1);
    });

    it('stores the room as readable JSON', async () => {
      await new RedisRoomsRepository(redis).saveRoom(makeContractRoom('abc'));
      const stored = await redis.get('room:abc');
      expect(JSON.parse(stored ?? '')).toMatchObject({ code: 'abc', owner: 'owner-id' });
    });

    it('findRoom gives a COPY: changing it without saving changes nothing in Redis', async () => {
      // The in-memory repository hands back the same object, so this "just
      // works" there. Here it doesn't: that's why the service must call saveRoom.
      const repo = new RedisRoomsRepository(redis);
      await repo.saveRoom(makeContractRoom('abc'));
      const found = await repo.findRoom('abc');
      found!.status = 'playing'; // changed, but not saved
      expect((await repo.findRoom('abc'))?.status).toBe('configuring');
    });
  });

  describe('updateRoom', () => {
    it('a change that throws half-way saves nothing (it worked on a copy)', async () => {
      const repo = new RedisRoomsRepository(redis);
      await repo.saveRoom(makeContractRoom('abc'));
      const update = repo.updateRoom('abc', (room) => {
        room!.status = 'playing';
        throw new Error('not allowed');
      });
      await expect(update).rejects.toThrow('not allowed');
      expect((await repo.findRoom('abc'))?.status).toBe('configuring');
    });
  });

  // The real-world version of the race, through the real RoomsService:
  // both browsers finish loading the video at the same moment.
  describe('RoomsService on top of Redis', () => {
    it('two players reporting "loaded" at the same moment: both count, the song starts', async () => {
      const service = new RoomsService(new Shuffler(), new Clock(), new RedisRoomsRepository(redis));
      const room = await service.createRoom({ id: 'host', nickname: 'host' });
      await service.joinRoom(room.code, 'guest', 'guest');
      await service.setSongsPerPlayer(room.code, 'host', 1);
      await service.submitSong(room.code, 'host', { youtubeId: 'aaaaaaaaaaa', startTimestamp: 0, title: 'a' });
      await service.submitSong(room.code, 'guest', { youtubeId: 'bbbbbbbbbbb', startTimestamp: 0, title: 'b' });
      await service.changePlayerReadyStatus(room.code, 'host');
      await service.changePlayerReadyStatus(room.code, 'guest');
      await service.startGame(room.code, 'host');

      const results = await Promise.all([
        service.markSongLoaded(room.code, 'host'),
        service.markSongLoaded(room.code, 'guest'),
      ]);

      const stored = await service.findRoomByCode(room.code);
      expect(stored.songLoadedBy).toEqual(new Set(['host', 'guest']));
      expect(stored.currentSongStartTime).not.toBeNull();
      // Exactly one of the two calls completed the loading, so playSong is sent once
      expect(results.filter((result) => result.allLoaded)).toHaveLength(1);
    });
  });

  describe('expiry (abandoned rooms delete themselves)', () => {
    // TTL answers: seconds left, -1 = "exists but never expires", -2 = "no such key"
    it('a saved room expires after 1 hour', async () => {
      await new RedisRoomsRepository(redis).saveRoom(makeContractRoom('abc'));
      const secondsLeft = await redis.ttl('room:abc');
      expect(secondsLeft).toBeGreaterThan(ONE_HOUR - 5);
      expect(secondsLeft).toBeLessThanOrEqual(ONE_HOUR);
    });

    it('saving again restarts the 1 hour (a room in use never expires)', async () => {
      const repo = new RedisRoomsRepository(redis);
      await repo.saveRoom(makeContractRoom('abc'));
      await redis.expire('room:abc', 10); // pretend the room is about to expire
      await repo.saveRoom(makeContractRoom('abc'));
      expect(await redis.ttl('room:abc')).toBeGreaterThan(ONE_HOUR - 5);
    });
  });
});
