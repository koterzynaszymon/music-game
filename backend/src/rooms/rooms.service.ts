import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  DEFAULT_SONG_DURATION,
  MAX_SONG_DURATION,
  MAX_SONGS_PER_PLAYER,
  MIN_SONG_DURATION,
  MIN_SONGS_PER_PLAYER,
  NewSong,
  Player,
  Room,
} from './room.model.js';
import { CreateRoomDto } from './dto/create-room.dto.js';
import { Shuffler } from './shuffler.js';
import {
  assertOwner,
  assertStatus,
  createPlayer,
  findPlayerOrThrow,
  playersOf,
  validateSong,
  currentSongOf,
  validateGuess,
  haveAllPlayersLoaded,
} from './room.helpers.js';
import { Clock } from './clock.js';
import { RoomsRepository } from './rooms.repository.js';
import { InMemoryRoomsRepository } from './in-memory-rooms.repository.js';

@Injectable()
export class RoomsService {
  constructor(
    private readonly shuffler: Shuffler = new Shuffler(),
    private readonly clock: Clock = new Clock(),
    private readonly roomsRepository: RoomsRepository = new InMemoryRoomsRepository(),
  ) {}

  async createRoom(dto: CreateRoomDto): Promise<Room> {
    const roomCode = Math.random().toString(36).substring(2, 15);
    if (await this.roomsRepository.findRoom(roomCode)) {
      throw new ConflictException('Room code already exists');
    }
    const room: Room = {
      code: roomCode,
      owner: dto.id,
      players: new Map<string, Player>(),
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
    room.players.set(dto.id, createPlayer(dto.id, dto.nickname));
    await this.roomsRepository.saveRoom(room);
    return room;
  }

  async findRoom(code: string): Promise<Room | undefined> {
    return await this.roomsRepository.findRoom(code);
  }

  async findRoomByCode(code: string): Promise<Room> {
    const room = await this.findRoom(code);
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    return room;
  }

  // Load the room, run `change` on it, save it: one uninterrupted step.
  // A missing room is a NotFound, exactly like findRoomByCode.
  private update<T>(code: string, change: (room: Room) => T): Promise<T> {
    return this.roomsRepository.updateRoom(code, (room) => {
      if (!room) {
        throw new NotFoundException('Room not found');
      }
      return change(room);
    });
  }

  async joinRoom(
    code: string,
    id: string,
    nickname: string,
  ): Promise<{ room: Room; isNewPlayer: boolean }> {
    return this.update(code, (room) => {
      // Reattach must work in every phase (refresh mid-game), so it is checked
      // before the phase rule below, which only applies to brand new players.
      if (room.players.has(id)) {
        return { room, isNewPlayer: false };
      }
      // Not assertStatus: joining late is Forbidden, not a BadRequest
      if (room.status !== 'configuring') {
        throw new ForbiddenException(
          'This room is no longer accepting new players',
        );
      }
      if (playersOf(room).some((player) => player.nickname === nickname)) {
        throw new ConflictException('Nickname already taken');
      }
      room.players.set(id, createPlayer(id, nickname));
      return { room, isNewPlayer: true };
    });
  }

  async changePlayerReadyStatus(code: string, id: string): Promise<Room> {
    return this.update(code, (room) => {
      const player = findPlayerOrThrow(room, id);
      assertStatus(
        room,
        'submitting',
        'You can only be ready while songs are being submitted',
      );
      player.isReady = !player.isReady;
      return room;
    });
  }

  async kickPlayer(code: string, requesterId: string, targetId: string): Promise<Room> {
    return this.update(code, (room) => {
      assertOwner(room, requesterId);
      if (room.owner === targetId) {
        throw new BadRequestException('You cannot kick yourself as an admin');
      }
      if (requesterId === targetId) {
        throw new BadRequestException('You cannot kick yourself as a player');
      }
      findPlayerOrThrow(room, targetId);
      room.players.delete(targetId);
      return room;
    });
  }

  async leaveRoom(code: string, id: string): Promise<Room> {
    return this.update(code, (room) => {
      findPlayerOrThrow(room, id);
      room.players.delete(id);
      return room;
    });
  }

  async closeRoom(code: string, id: string): Promise<Room> {
    const room = await this.findRoomByCode(code);
    assertOwner(room, id);
    await this.roomsRepository.deleteRoom(code);
    return room;
  }

  async setSongsPerPlayer(
    code: string,
    requesterId: string,
    songsPerPlayer: number,
    songDuration: number = DEFAULT_SONG_DURATION,
  ): Promise<Room> {
    return this.update(code, (room) => {
      assertOwner(room, requesterId);
      assertStatus(
        room,
        'configuring',
        'Songs per player has already been submitted',
      );
      if (
        !Number.isInteger(songsPerPlayer) ||
        songsPerPlayer < MIN_SONGS_PER_PLAYER ||
        songsPerPlayer > MAX_SONGS_PER_PLAYER
      ) {
        throw new BadRequestException(
          `Songs per player must be a whole number from ${MIN_SONGS_PER_PLAYER} to ${MAX_SONGS_PER_PLAYER}`,
        );
      }
      if (
        !Number.isInteger(songDuration) ||
        songDuration < MIN_SONG_DURATION ||
        songDuration > MAX_SONG_DURATION
      ) {
        throw new BadRequestException(
          `Song duration must be a whole number of seconds from ${MIN_SONG_DURATION} to ${MAX_SONG_DURATION}`,
        );
      }
      // All checks passed, so all changes happen together (never one without the others)
      room.songsPerPlayer = songsPerPlayer;
      room.songDuration = songDuration;
      room.status = 'submitting';
      return room;
    });
  }

  async markSongLoaded(code: string, id: string): Promise<{ room: Room; allLoaded: boolean }> {
    return this.update(code, (room) => {
      findPlayerOrThrow(room, id);
      assertStatus(
        room,
        'playing',
        'You can only mark songs as loaded while the game is playing',
      );
      if(room.currentSongStartTime !== null) {
        return {room, allLoaded: false};
      }
      room.songLoadedBy.add(id);
      if(haveAllPlayersLoaded(room)) {
        room.currentSongStartTime = this.clock.now();
      }
      return {room, allLoaded: haveAllPlayersLoaded(room)};
    });
  }

  async submitSong(code: string, id: string, song: NewSong): Promise<Room> {
    return this.update(code, (room) => {
      validateSong(song);
      const player = findPlayerOrThrow(room, id);
      assertStatus(
        room,
        'submitting',
        'You can only submit songs while songs are being submitted',
      );
      if (player.songs.length >= room.songsPerPlayer) {
        throw new BadRequestException(
          `You can only submit ${room.songsPerPlayer} songs`,
        );
      }
      // All checks passed: only now build the stored song. A new object, so the
      // caller's input is left untouched.
      player.songs.push({
        ...song,
        title: song.title.trim().toLowerCase(),
        submittedBy: id,
      });
      return room;
    });
  }

  async startGame(code: string, requesterId: string): Promise<Room> {
    return this.update(code, (room) => {
      assertOwner(room, requesterId);
      assertStatus(
        room,
        'submitting',
        'You can only start the game while all players are ready',
      );
      const players = playersOf(room);
      if (!players.every((player) => player.isReady)) {
        throw new BadRequestException(
          'All players must be ready to start the game',
        );
      }
      room.playlist = this.shuffler.shuffle(
        players.flatMap((player) => player.songs),
      );
      room.status = 'playing';
      room.currentSongIndex = 0;
      room.currentSongStartTime = null;
      room.songRevealed = false;
      room.guessedBy = new Set();
      room.songLoadedBy = new Set();
      return room;
    });
  }

  async submitGuess(
    code: string,
    id: string,
    guess: string,
  ): Promise<{ room: Room; correct: boolean }> {
    return this.update(code, (room) => {
      const player = findPlayerOrThrow(room, id);
      assertStatus(
        room,
        'playing',
        'You can only submit guesses while the game is playing',
      );
      validateGuess(guess);
      const currentSong = currentSongOf(room);
      if (!currentSong) {
        throw new BadRequestException('No song is currently playing');
      }
      if (room.currentSongStartTime === null) {
        throw new BadRequestException('No song start time is recorded');
      }
      // Guesses that can never score are ignored, not errors: time already ran out
      // (a guess can arrive a moment late), already scored on this song,
      // or it's your own song (you know the title)
      if (
        room.songRevealed ||
        room.guessedBy.has(id) ||
        currentSong.submittedBy === id
      ) {
        return { room, correct: false };
      }
      // Titles are stored trimmed + lowercase (see submitSong), so compare the same way
      if (guess.trim().toLowerCase() !== currentSong.title) {
        return { room, correct: false };
      }
      player.score += Math.floor(
        (this.clock.now() - room.currentSongStartTime) / 1000,
      );
      room.guessedBy.add(id);
      return { room, correct: true };
    });
  }


  async endCurrentSong(code: string): Promise<{ room: Room; title: string }> {
    return this.update(code, (room) => {
      assertStatus(
        room,
        'playing',
        'You can only end a song while the game is playing',
      );
      const currentSong = currentSongOf(room);
      if (!currentSong) {
        throw new BadRequestException('No song is currently playing');
      }
      if (room.currentSongStartTime === null) {
        throw new BadRequestException('The song has not started yet');
      }
      if (room.songRevealed) {
        throw new BadRequestException('This song has already ended');
      }
      // Penalty: not guessing costs more than the slowest possible correct guess.
      // The submitter is skipped: they aren't allowed to guess their own song.
      for (const player of playersOf(room)) {
        const couldGuess = player.id !== currentSong.submittedBy;
        if (couldGuess && !room.guessedBy.has(player.id)) {
          player.score += room.songDuration + 1;
        }
      }
      room.songRevealed = true;
      return { room, title: currentSong.title };
    });
  }

  async nextSong(code: string, requesterId: string): Promise<Room> {
    return this.update(code, (room) => {
      assertOwner(room, requesterId);
      assertStatus(
        room,
        'playing',
        'You can only skip songs while the game is playing',
      );
      const currentSong = currentSongOf(room);
      if (!currentSong) {
        throw new BadRequestException('No song is currently playing');
      }
      if (!room.songRevealed) {
        throw new BadRequestException(
          'Wait until the time is up and the answer is shown',
        );
      }
      if (room.currentSongIndex === room.playlist.length - 1) {
        room.status = 'finished';
        return room;
      }
      room.currentSongIndex++;
      room.currentSongStartTime = null;
      room.songRevealed = false;
      room.guessedBy.clear();
      room.songLoadedBy.clear();
      return room;
    });
  }

  // Back to the lobby after the leaderboard: same room, same people, fresh game.
  // songsPerPlayer and songDuration are kept on purpose: they're the starting
  // values of the host's settings.
  async resetRoom(code: string, requesterId: string): Promise<Room> {
    return this.update(code, (room) => {
      assertOwner(room, requesterId);
      assertStatus(
        room,
        'finished',
        'You can only go back to the lobby after the game has finished',
      );
      // The room: the same values createRoom starts with
      room.status = 'configuring';
      room.playlist = [];
      room.currentSongIndex = 0;
      room.currentSongStartTime = null;
      room.songRevealed = false;
      room.guessedBy.clear();
      room.songLoadedBy.clear();
      // The players stay, only their game data is reset
      for (const player of playersOf(room)) {
        player.score = 0;
        player.isReady = false;
        player.songs = [];
      }
      return room;
    });
  }
}
