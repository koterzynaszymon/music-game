import { describe, it, expect } from 'vitest';
import { RoomSerializer } from './room.serializer.js';
import { DEFAULT_SONG_DURATION, Player, Room } from './room.model.js';

// Redis stores text, so a Room must become a string (RoomSerializer.serialize) and back
// (RoomSerializer.deserialize). The catch: JSON.stringify(new Map()) and
// JSON.stringify(new Set()) both give "{}", so Map/Set fields are silently lost
// unless these functions convert them.

const HOST = 'host-id';
const PLAYER = 'player-id';

function makePlayer(id: string, overrides: Partial<Player> = {}): Player {
  return { id, nickname: id, score: 0, isReady: false, songs: [], ...overrides };
}

// A freshly created room: nothing filled in yet
function makeEmptyRoom(): Room {
  return {
    code: 'abc123',
    owner: HOST,
    players: new Map(),
    status: 'configuring',
    songsPerPlayer: 2,
    songDuration: DEFAULT_SONG_DURATION,
    playlist: [],
    currentSongIndex: 0,
    currentSongStartTime: null,
    songRevealed: false,
    guessedBy: new Set(),
    songLoadedBy: new Set(),
  };
}

// A room in the middle of a game: every field holds something
function makePlayingRoom(): Room {
  const alpha = { youtubeId: 'aaaaaaaaaaa', startTimestamp: 30, submittedBy: PLAYER, title: 'alpha' };
  const bravo = { youtubeId: 'bbbbbbbbbbb', startTimestamp: 0, submittedBy: HOST, title: 'bravo' };
  return {
    ...makeEmptyRoom(),
    players: new Map([
      [HOST, makePlayer(HOST, { score: 3, isReady: true, songs: [bravo] })],
      [PLAYER, makePlayer(PLAYER, { score: 11, isReady: true, songs: [alpha] })],
    ]),
    status: 'playing',
    playlist: [alpha, bravo],
    currentSongIndex: 1,
    currentSongStartTime: 1_700_000_000_000,
    guessedBy: new Set([HOST]),
    songLoadedBy: new Set([HOST, PLAYER]),
  };
}

// The round trip: what goes in must come back out
const roundTrip = (room: Room) => RoomSerializer.deserialize(RoomSerializer.serialize(room));

describe('room serializer', () => {
  describe('serialize', () => {
    it('returns a string (that is what Redis stores)', () => {
      expect(typeof RoomSerializer.serialize(makePlayingRoom())).toBe('string');
    });
    it('the string is valid JSON (so you can read it in redis-cli)', () => {
      expect(() => JSON.parse(RoomSerializer.serialize(makePlayingRoom()))).not.toThrow();
    });
    it('does not change the room it was given', () => {
      const room = makePlayingRoom();
      RoomSerializer.serialize(room);
      expect(room).toEqual(makePlayingRoom());
    });
  });

  describe('round trip (serialize, then deserialize)', () => {
    // toEqual compares Maps and Sets by their contents, so this one test
    // already covers every field. The tests below pin down the details,
    // so a failure tells you exactly WHAT broke.
    it('gives back an equal room, mid-game', () => {
      expect(roundTrip(makePlayingRoom())).toEqual(makePlayingRoom());
    });
    it('gives back an equal room, freshly created (empty Map, empty Sets)', () => {
      expect(roundTrip(makeEmptyRoom())).toEqual(makeEmptyRoom());
    });

    // --- the fields JSON would lose on its own ---
    it('players comes back as a real Map, so players.get(id) works', () => {
      const room = roundTrip(makePlayingRoom());
      expect(room.players).toBeInstanceOf(Map);
      expect(room.players.get(HOST)?.score).toBe(3);
      expect(room.players.size).toBe(2);
    });
    it('guessedBy comes back as a real Set, so guessedBy.has(id) works', () => {
      const room = roundTrip(makePlayingRoom());
      expect(room.guessedBy).toBeInstanceOf(Set);
      expect(room.guessedBy.has(HOST)).toBe(true);
      expect(room.guessedBy.has(PLAYER)).toBe(false);
    });
    it('songLoadedBy comes back as a real Set', () => {
      const room = roundTrip(makePlayingRoom());
      expect(room.songLoadedBy).toBeInstanceOf(Set);
      expect(room.songLoadedBy.size).toBe(2);
    });

    // --- values that are easy to get subtly wrong ---
    it('keeps each player\'s songs (arrays nested inside the Map)', () => {
      const room = roundTrip(makePlayingRoom());
      expect(room.players.get(PLAYER)?.songs).toEqual([
        { youtubeId: 'aaaaaaaaaaa', startTimestamp: 30, submittedBy: PLAYER, title: 'alpha' },
      ]);
    });
    it('keeps currentSongStartTime as null (not undefined, not 0)', () => {
      expect(roundTrip(makeEmptyRoom()).currentSongStartTime).toBeNull();
    });
    it('keeps currentSongStartTime as an exact number of milliseconds', () => {
      expect(roundTrip(makePlayingRoom()).currentSongStartTime).toBe(1_700_000_000_000);
    });
    it('keeps the playlist order (it is the shuffled play order)', () => {
      const titles = roundTrip(makePlayingRoom()).playlist.map((song) => song.title);
      expect(titles).toEqual(['alpha', 'bravo']);
    });

    // --- it must be a copy, like a real database gives you ---
    it('gives back a new object, not the one that went in', () => {
      const room = makePlayingRoom();
      const copy = roundTrip(room);
      expect(copy).not.toBe(room);
      expect(copy.players).not.toBe(room.players);
    });
  });

  // --- rules you still have to decide on ---
  it.todo('what should deserialize do with text that is not a valid room? (throw? return undefined?)');
  it.todo('should the stored text include a format version, for when Room changes later?');
});
