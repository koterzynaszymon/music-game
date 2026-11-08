import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  MAX_SONGS_PER_PLAYER,
  MIN_SONGS_PER_PLAYER,
  Player,
  Room,
  Song,
} from './room.model.js';
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
      status: 'configuring',
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
    // Reattach must work in every phase (refresh mid-game), so it is checked
    // before the phase rule below, which only applies to brand new players.
    if (room.players.has(id)) {
      return { room, isNewPlayer: false };
    }
    if (room.status !== 'configuring') {
      throw new ForbiddenException('This room is no longer accepting new players');
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
  changePlayerReadyStatus(code: string, id: string): Room {
    const room = this.findRoomByCode(code);
    const player = room.players.get(id);
    if(!player) {
      throw new NotFoundException('Player not found');
    }
    if(room.status !== 'submitting') {
      throw new BadRequestException('You can only be ready while songs are being submitted');
    }
    player.isReady = !player.isReady;
    return room;
  }
  kickPlayer(code: string, requesterId: string, targetId: string): Room {
    const room = this.findRoomByCode(code);
    if(room.owner !== requesterId) {
      throw new ForbiddenException('You are not the owner of the room');
    }
    if(room.owner === targetId) {
      throw new BadRequestException('You cannot kick yourself as an admin');
    }
    if(requesterId === targetId) {
      throw new BadRequestException('You cannot kick yourself as a player');
    }
    if(!room.players.has(targetId)) {
      throw new NotFoundException('Player not found');
    }
    room.players.delete(targetId);

    return room;
  }
  leaveRoom(code: string, id: string) : Room {
    const room = this.findRoomByCode(code);
    if(!room.players.has(id)) {
      throw new NotFoundException('Player not found');
    }
    room.players.delete(id);
    return room;
  }
  closeRoom(code: string, id: string) : Room {
    const room = this.findRoomByCode(code);
    if(room.owner !== id) {
      throw new ForbiddenException('You are not the owner of the room');
    }
    this.rooms.delete(code);
    return room;
  }
  setSongsPerPlayer(code: string, requesterId: string, songsPerPlayer: number): Room {
    const room = this.findRoomByCode(code);
    if(room.owner !== requesterId) {
      throw new ForbiddenException('You are not the owner of the room');
    }
    if(room.status !== 'configuring') {
      throw new BadRequestException('Songs per player has already been submitted');
    }
    if(
      !Number.isInteger(songsPerPlayer) ||
      songsPerPlayer < MIN_SONGS_PER_PLAYER ||
      songsPerPlayer > MAX_SONGS_PER_PLAYER
    ) {
      throw new BadRequestException(
        `Songs per player must be a whole number from ${MIN_SONGS_PER_PLAYER} to ${MAX_SONGS_PER_PLAYER}`,
      );
    }
    // All checks passed, so both changes happen together (never one without the other)
    room.songsPerPlayer = songsPerPlayer;
    room.status = 'submitting';
    return room;
  }
  submitSong(code: string, id: string, song: Song): Room {
    // YouTube video IDs: exactly 11 characters from A-Z, a-z, 0-9, "_" and "-"
    const idRegex = /^[A-Za-z0-9_-]{11}$/;
    const room = this.findRoomByCode(code);
    song.title = song.title.trim().toLowerCase();
    const player = room.players.get(id);
    if(song.title === '') {
      throw new BadRequestException('Song title cannot be empty');
    }
    if(song.startTimestamp < 0) {
      throw new BadRequestException('Song start timestamp cannot be negative');
    }
    if(song.startTimestamp % 1 !== 0 || isNaN(song.startTimestamp)) {
      throw new BadRequestException('Song start timestamp must be a whole number');
    }
    if(song.youtubeId === '' || song.youtubeId === null || song.youtubeId === undefined || song.youtubeId.trim() === '' || song.youtubeId.trim().length !== 11 || song.youtubeId.includes(' ') || !idRegex.test(song.youtubeId)) {
      throw new BadRequestException('Song youtubeId is invalid');
    }
    if (!player) {
      throw new NotFoundException('Player not found');
    }
    if(room.status !== 'submitting') {
      throw new BadRequestException('You can only submit songs while songs are being submitted');
    }
    if(player.songs.length >= room.songsPerPlayer) {
      throw new BadRequestException(`You can only submit ${room.songsPerPlayer} songs`);
    }
    song.submittedBy = id;
    player.songs.push(song);
    return room;
  }
}
