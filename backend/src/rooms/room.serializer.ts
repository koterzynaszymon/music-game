import { Room } from './room.model.js';

export class RoomSerializer {
  static serialize(room: Room): string {
  const plain = {
    ...room,
    players: [...room.players], // Map -> [[id, player], [id, player], ...]
    guessedBy: [...room.guessedBy], // Set -> [id, id, ...]
    songLoadedBy: [...room.songLoadedBy], // Set -> [id, id, ...]
  };
  return JSON.stringify(plain);
}

  static deserialize(serialized: string): Room {
  const plain = JSON.parse(serialized);
  return {
    ...plain,
    players: new Map(plain.players),
    guessedBy: new Set(plain.guessedBy),
    songLoadedBy: new Set(plain.songLoadedBy),
  };
  }
}