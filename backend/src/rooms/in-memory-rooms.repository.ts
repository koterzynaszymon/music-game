import { Injectable } from '@nestjs/common';
import { Room } from './room.model.js';
import { RoomsRepository } from './rooms.repository.js';

// Keeps rooms in this process's memory: lost on restart, not shared between
// server instances. Used now, and as the fast fake in tests later.
// `async` here only wraps the result in a Promise, to match RoomsRepository.
@Injectable()
export class InMemoryRoomsRepository extends RoomsRepository {
  private rooms = new Map<string, Room>();

  async findRoom(code: string): Promise<Room | undefined> {
    return this.rooms.get(code);
  }

  async saveRoom(room: Room): Promise<void> {
    this.rooms.set(room.code, room);
  }

  async deleteRoom(code: string): Promise<void> {
    this.rooms.delete(code);
  }

  // Already safe without a lock: there is no `await` between reading and saving, and JavaScript never interrupts code that doesn't await.
  async updateRoom<T>(code: string, change: (room: Room | undefined) => T): Promise<T> {
    const room = this.rooms.get(code);
    const result = change(room);
    if (room) {
      this.rooms.set(code, room);
    }
    return result;
  }
}
