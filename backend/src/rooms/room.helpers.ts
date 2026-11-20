import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Player, Room, RoomStatus, Song } from './room.model.js';

// Small, stateless building blocks shared by RoomsService methods.
// None of them touch the stored rooms: they get a room/song and either
// return something or throw. That keeps them trivial to reason about.

// YouTube video IDs: exactly 11 characters from A-Z, a-z, 0-9, "_" and "-"
const YOUTUBE_ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

export function createPlayer(id: string, nickname: string): Player {
  return {
    id,
    nickname,
    score: 0,
    isReady: false,
    songs: [],
  };
}

export function playersOf(room: Room): Player[] {
  return Array.from(room.players.values());
}

export function findPlayerOrThrow(room: Room, id: string): Player {
  const player = room.players.get(id);
  if (!player) {
    throw new NotFoundException('Player not found');
  }
  return player;
}

export function assertOwner(room: Room, requesterId: string): void {
  if (room.owner !== requesterId) {
    throw new ForbiddenException('You are not the owner of the room');
  }
}

export function assertStatus(
  room: Room,
  status: RoomStatus,
  message: string,
): void {
  if (room.status !== status) {
    throw new BadRequestException(message);
  }
}

// Only checks, never modifies the song (the caller normalizes it afterwards)
export function validateSong(song: Song): void {
  if (song.title.trim() === '') {
    throw new BadRequestException('Song title cannot be empty');
  }
  if (song.startTimestamp < 0) {
    throw new BadRequestException('Song start timestamp cannot be negative');
  }
  if (song.startTimestamp % 1 !== 0 || isNaN(song.startTimestamp)) {
    throw new BadRequestException('Song start timestamp must be a whole number');
  }
  // The regex alone already rejects empty, too short/long and space-containing ids
  if (!YOUTUBE_ID_REGEX.test(song.youtubeId)) {
    throw new BadRequestException('Song youtubeId is invalid');
  }
}

export function currentSongOf(room: Room): Song | undefined {
  return room.status === 'playing' ? room.playlist[room.currentSongIndex] : undefined;
}
export function haveAllPlayersGuessed(room: Room): boolean {
  return room.players.size - 1 === room.guessedBy.size;
}
export function haveAllPlayersLoaded(room: Room): boolean {
  return room.players.size === room.songLoadedBy.size;
}
export function validateGuess(guess: string): void {
  if (guess.trim() === '') {
    throw new BadRequestException('Guess cannot be empty');
  }
}