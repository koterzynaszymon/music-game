import { describe } from 'vitest';
import { InMemoryRoomsRepository } from './in-memory-rooms.repository.js';
import { describeRoomsRepositoryContract } from './rooms-repository.contract.js';

describe('InMemoryRoomsRepository', () => {
  describeRoomsRepositoryContract(() => new InMemoryRoomsRepository());
});
