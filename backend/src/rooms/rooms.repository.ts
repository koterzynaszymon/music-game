import { Room } from './room.model.js';

// Where rooms are stored. RoomsService only talks to this, never to a Map or
// to Redis directly, so the storage can be swapped without touching game rules.

export abstract class RoomsRepository {
  abstract findRoom(code: string): Promise<Room | undefined>;
  abstract saveRoom(room: Room): Promise<void>;
  abstract deleteRoom(code: string): Promise<void>;

  // Read the room, let `change` modify it, save it: as ONE step
  abstract updateRoom<T>(code: string, change: (room: Room | undefined) => T): Promise<T>;
}
