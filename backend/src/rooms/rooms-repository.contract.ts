import { describe, it, expect } from 'vitest';
import { DEFAULT_SONG_DURATION, Room } from './room.model.js';
import { RoomsRepository } from './rooms.repository.js';

// The CONTRACT every RoomsRepository must keep, written once and run against
// every implementation (in-memory in the unit tests, Redis in the integration
// tests). If both pass, RoomsService can't tell them apart.
//
// Not a *.spec.ts file on purpose: it contains no tests by itself, it only
// adds them to whichever spec file calls it.

export function makeContractRoom(code: string): Room {
  return {
    code,
    owner: 'owner-id',
    players: new Map([
      ['owner-id', { id: 'owner-id', nickname: 'ann', score: 3, isReady: true, songs: [] }],
    ]),
    status: 'configuring',
    songsPerPlayer: 2,
    songDuration: DEFAULT_SONG_DURATION,
    playlist: [],
    currentSongIndex: 0,
    currentSongStartTime: null,
    songRevealed: false,
    guessedBy: new Set(['owner-id']),
    songLoadedBy: new Set(),
  };
}

export function describeRoomsRepositoryContract(createRepository: () => RoomsRepository) {
  describe('RoomsRepository contract', () => {
    it('finds nothing for an unknown code', async () => {
      const repo = createRepository();
      expect(await repo.findRoom('nope')).toBeUndefined();
    });

    it('finds a saved room by its code', async () => {
      const repo = createRepository();
      await repo.saveRoom(makeContractRoom('abc'));
      expect((await repo.findRoom('abc'))?.code).toBe('abc');
    });

    it('a found room equals the saved one, Map and Sets included', async () => {
      const repo = createRepository();
      await repo.saveRoom(makeContractRoom('abc'));
      const found = await repo.findRoom('abc');
      expect(found).toEqual(makeContractRoom('abc'));
      expect(found?.players.get('owner-id')?.nickname).toBe('ann');
      expect(found?.guessedBy.has('owner-id')).toBe(true);
    });

    it('saving again overwrites the stored room', async () => {
      const repo = createRepository();
      await repo.saveRoom(makeContractRoom('abc'));
      await repo.saveRoom({ ...makeContractRoom('abc'), status: 'submitting' });
      expect((await repo.findRoom('abc'))?.status).toBe('submitting');
    });

    it('rooms with different codes are stored separately', async () => {
      const repo = createRepository();
      await repo.saveRoom(makeContractRoom('abc'));
      await repo.saveRoom({ ...makeContractRoom('xyz'), status: 'playing' });
      expect((await repo.findRoom('abc'))?.status).toBe('configuring');
      expect((await repo.findRoom('xyz'))?.status).toBe('playing');
    });

    it('a deleted room can no longer be found', async () => {
      const repo = createRepository();
      await repo.saveRoom(makeContractRoom('abc'));
      await repo.deleteRoom('abc');
      expect(await repo.findRoom('abc')).toBeUndefined();
    });

    it('deleting a room leaves the other rooms alone', async () => {
      const repo = createRepository();
      await repo.saveRoom(makeContractRoom('abc'));
      await repo.saveRoom(makeContractRoom('xyz'));
      await repo.deleteRoom('abc');
      expect(await repo.findRoom('xyz')).toBeDefined();
    });

    it('deleting an unknown code does nothing', async () => {
      const repo = createRepository();
      await expect(repo.deleteRoom('nope')).resolves.toBeUndefined();
    });

    // --- updateRoom: read, change and save as ONE step ---
    describe('updateRoom', () => {
      it('saves the changes made inside it', async () => {
        const repo = createRepository();
        await repo.saveRoom(makeContractRoom('abc'));
        await repo.updateRoom('abc', (room) => {
          room!.status = 'playing';
        });
        expect((await repo.findRoom('abc'))?.status).toBe('playing');
      });

      it('returns what the change returns', async () => {
        const repo = createRepository();
        await repo.saveRoom(makeContractRoom('abc'));
        expect(await repo.updateRoom('abc', (room) => room?.owner)).toBe('owner-id');
      });

      it('gives the change undefined for an unknown code, and stores nothing', async () => {
        const repo = createRepository();
        const seen: unknown[] = [];
        await repo.updateRoom('nope', (room) => {
          seen.push(room);
        });
        expect(seen).toEqual([undefined]);
        expect(await repo.findRoom('nope')).toBeUndefined();
      });

      // This is how a rule check (e.g. "only the host may start") cancels an
      // update. The service checks every rule BEFORE changing anything, so a
      // throw always happens while the room is still untouched.
      // (Throwing AFTER a change: Redis saves nothing, but the in-memory
      // repository hands out the stored object itself, so the change is already
      // in it. That's why the contract only promises the error, and the rule
      // stays: check everything first, change after.)
      it('if the change throws, the error comes out and the room stays as it was', async () => {
        const repo = createRepository();
        await repo.saveRoom(makeContractRoom('abc'));
        const update = repo.updateRoom('abc', () => {
          throw new Error('not allowed');
        });
        await expect(update).rejects.toThrow('not allowed');
        expect((await repo.findRoom('abc'))?.status).toBe('configuring');
      });

      // THE race condition: many updates to one room at the same moment.
      // Without protection each one reads the same old room, adds itself, and
      // saves, overwriting all the others: only the last one survives.
      it('20 updates at the same moment are ALL kept (none overwrites another)', async () => {
        const repo = createRepository();
        await repo.saveRoom({ ...makeContractRoom('abc'), guessedBy: new Set() });
        const ids = Array.from({ length: 20 }, (_, i) => `player-${i}`);
        await Promise.all(
          ids.map((id) => repo.updateRoom('abc', (room) => {
            room!.guessedBy.add(id);
          })),
        );
        expect((await repo.findRoom('abc'))?.guessedBy).toEqual(new Set(ids));
      });

      it('an update running while the room is deleted does not bring it back', async () => {
        const repo = createRepository();
        await repo.saveRoom(makeContractRoom('abc'));
        await Promise.all([
          repo.updateRoom('abc', (room) => {
            room!.status = 'playing';
          }),
          repo.deleteRoom('abc'),
        ]);
        expect(await repo.findRoom('abc')).toBeUndefined();
      });
    });
  });
}
