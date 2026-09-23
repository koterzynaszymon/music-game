import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Player, Room } from './room.model.js';
import { CreateRoomDto } from './dto/create-room.dto.js';

@Injectable()
export class RoomsService {
  private rooms = new Map<string, Room>();

  createRoom(dto: CreateRoomDto): Room {
    const player: Player = {
      id: dto.id,
      nickname: dto.nickname,
      score: 0,
      isReady: false,
      songs: [],
    };
    const roomCode = Math.random().toString(36).substring(2, 15);
    if (this.rooms.has(roomCode)) {
      throw new ConflictException('Room code already exists');
    }
    const room: Room = {
      code: roomCode,
      owner: dto.id,
      players: new Map<string, Player>(),
      status: 'waiting',
      songsPerPlayer: 2,
    };
    room.players.set(dto.id, player);
    this.rooms.set(roomCode, room);
    return room;
  }

  findRoom(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  joinRoom(
    code: string,
    id: string,
    nickname: string,
  ): { room: Room; isNewPlayer: boolean } {
    const room = this.findRoomByCode(code);
    if (room.players.has(id)) {
      return { room, isNewPlayer: false };
    }
    for (const player of room.players.values()) {
      if (player.nickname === nickname) {
        throw new ConflictException('Nickname already taken');
      }
    }
    const newPlayer: Player = {
      id: id,
      nickname: nickname,
      score: 0,
      isReady: false,
      songs: [],
    };
    room.players.set(id, newPlayer);
    return { room, isNewPlayer: true };
  }
  findRoomByCode(code: string): Room {
    const room = this.rooms.get(code);
    if(!room) {
      throw new NotFoundException('Room not found');
    }
    return room;
  }
}
