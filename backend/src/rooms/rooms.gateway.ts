import { UseFilters } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RoomsService } from './rooms.service.js';
import {
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { JoinRoomDto } from './dto/join-room.dto.js';
import { Room, Song, toPublicRoom } from './room.model.js';
import { ChangePlayerReadyStatusDto } from './dto/change-player-ready-status.dto.js';
import { KickPlayerDto } from './dto/kick-player.dto.js';
import { LeaveRoomDto } from './dto/leave-room.dto.js';
import { CloseRoomDto } from './dto/close-room.dto.js';
import { SetSongsPerPlayerDto } from './dto/set-songs-per-player.dto.js';
import { SubmitSongDto } from './dto/submit-song.dto.js';
import { StartGameDto } from './dto/start-game.dto.js';
import { WsErrorFilter } from '../common/ws-error.filter.js';
import { currentSongOf } from './room.helpers.js';
import { SongLoadedDto } from './dto/song-loaded.dto.js';
import { SubmitGuessDto } from './dto/submit-guess.dto.js';
import { NextSongDto } from './dto/next-song.dto.js';
import { ResetRoomDto } from './dto/reset-room.dto.js';
import { SongTimers } from './song-timers.js';
// Errors thrown by any handler are sent to the client as an "error" event by WsErrorFilter
@UseFilters(WsErrorFilter)
@WebSocketGateway({ cors: { origin: '*' } })
export class RoomsGateway {
  @WebSocketServer() server: Server;

  constructor(
    private readonly roomsService: RoomsService,
    private readonly songTimers: SongTimers = new SongTimers(),
  ) {}

  // Always goes through toPublicRoom, so song titles can't be broadcast by accident
  private broadcastRoom(room: Room) {
    this.server.to(room.code).emit('roomUpdated', toPublicRoom(room));
  }

  // A player's own songs, sent only to them (the public room has just a count)
  private songsOf(room: Room, playerId: string): Song[] {
    return room.players.get(playerId)?.songs ?? [];
  }

  private loadSongPayload(room: Room) {
    const song = currentSongOf(room);
    if (!song) {
      return undefined;
    }
    return {
      youtubeId: song.youtubeId,
      startTimestamp: song.startTimestamp,
      index: room.currentSongIndex,
      total: room.playlist.length,
    };
  }

  // Tells every client in the room to cue (load, but not play) the current song.
  // Each client answers with "songLoaded"; when all have, the server emits "playSong".
  private emitLoadSong(room: Room) {
    const payload = this.loadSongPayload(room);
    if (!payload) {
      return;
    }
    this.server.to(room.code).emit('loadSong', payload);
  }

  // Called by the timer, songDuration seconds after the song started.
  // No player sent a message here, so nothing would catch an error: an
  // uncaught throw inside a timer would crash the whole server. Hence try/catch.
  private revealSong(code: string) {
    try {
      const { room, title } = this.roomsService.endCurrentSong(code);
      this.server.to(room.code).emit('songEnded', { title });
      this.broadcastRoom(room); // scores now include the no-guess penalty
    } catch (error) {
      console.error(`Couldn't end the song in room ${code}:`, error);
    }
  }

  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @MessageBody() dto: JoinRoomDto,
    @ConnectedSocket() client: Socket,
  ) {
    const { code, id, nickname } = dto;
    // Own try/catch instead of the filter: a failed join needs a different
    // event, so the client leaves the room page instead of staying on an empty one
    try {
      const { room, isNewPlayer } = this.roomsService.joinRoom(
        code,
        id,
        nickname,
      );

      client.join(room.code);
      client.join(id);
      if (isNewPlayer) {
        this.broadcastRoom(room);
      }

      client.emit('roomJoined', {
        room: toPublicRoom(room),
        isNewPlayer: isNewPlayer,
        mySongs: this.songsOf(room, id),
      });

      // Rejoining mid-game (e.g. page refresh): this client has no player
      // anymore, so send it the current song. Only to THIS client: emitLoadSong
      // would make everyone in the room reload.
      const payload = this.loadSongPayload(room); // undefined unless playing
      if (payload) {
        client.emit('loadSong', payload);
        const song = currentSongOf(room);
        if (room.songRevealed && song) {
          // Time already ran out: show the answer, don't play
          client.emit('songEnded', { title: song.title });
        } else if (room.currentSongStartTime !== null) {
          // If the song already started, the others won't wait for this client:
          // its later "songLoaded" is ignored by the service, so no playSong would
          // ever reach it. Tell it to play right away instead.
          client.emit('playSong');
        }
      }
    } catch (error) {
      client.emit('joinRejected', {
        message: (error as Error).message,
      });
    }
  }

  @SubscribeMessage('changePlayerReadyStatus')
  handleChangePlayerReadyStatus(@MessageBody() dto: ChangePlayerReadyStatusDto) {
    const room = this.roomsService.changePlayerReadyStatus(dto.code, dto.id);
    this.broadcastRoom(room);
  }

  @SubscribeMessage('kickPlayer')
  handleKickPlayer(@MessageBody() dto: KickPlayerDto) {
    const { code, requesterId, targetId } = dto;
    const room = this.roomsService.kickPlayer(code, requesterId, targetId);
    this.server.to(targetId).emit('kicked');
    this.broadcastRoom(room);
  }

  @SubscribeMessage('leaveRoom')
  handleLeaveRoom(
    @MessageBody() dto: LeaveRoomDto,
    @ConnectedSocket() client: Socket,
  ) {
    const { code, id } = dto;
    const room = this.roomsService.leaveRoom(code, id);
    this.server.to(id).emit('leftRoom');
    this.broadcastRoom(room);
    client.leave(room.code);
    client.leave(id);
  }

  @SubscribeMessage('closeRoom')
  handleCloseRoom(
    @MessageBody() dto: CloseRoomDto,
    @ConnectedSocket() client: Socket,
  ) {
    const room = this.roomsService.closeRoom(dto.code, dto.id);
    this.songTimers.cancel(room.code);
    client.to(room.code).emit('roomClosed');
    this.server.in(room.code).socketsLeave(room.code);
  }

  @SubscribeMessage('setSongsPerPlayer')
  handleSetSongsPerPlayer(@MessageBody() dto: SetSongsPerPlayerDto) {
    const { code, requesterId, songsPerPlayer, songDuration } = dto;
    const room = this.roomsService.setSongsPerPlayer(
      code,
      requesterId,
      songsPerPlayer,
      songDuration,
    );
    this.broadcastRoom(room);
  }

  @SubscribeMessage('submitSong')
  handleSubmitSong(
    @MessageBody() dto: SubmitSongDto,
    @ConnectedSocket() client: Socket,
  ) {
    const { code, id, song } = dto;
    const room = this.roomsService.submitSong(code, id, song);
    this.broadcastRoom(room);
    client.emit('songSubmitted', { songs: this.songsOf(room, id) });
  }

  @SubscribeMessage('startGame')
  handleStartGame(
    @MessageBody() dto: StartGameDto,
    @ConnectedSocket() client: Socket,
  ) {
    const room = this.roomsService.startGame(dto.code, dto.requesterId);
    this.broadcastRoom(room);
    this.emitLoadSong(room);
    // TODO: ONLY FOR TESTING, DELETE LATER
    client.emit('gameStarted', {
      playlist: room.playlist.map(song => ({
        youtubeId: song.youtubeId,
        startTimestamp: song.startTimestamp,
        title: song.title,
      })),
    });
  }

  @SubscribeMessage('songLoaded')
  handleSongLoaded(@MessageBody() dto: SongLoadedDto) {
    const { code, id } = dto;
    const { room, allLoaded } = this.roomsService.markSongLoaded(code, id);
    this.broadcastRoom(room);
    if(allLoaded) {
      this.server.to(room.code).emit('playSong');

      this.songTimers.start(room.code, room.songDuration * 1000, () =>
        this.revealSong(room.code),
      );
    }
  }

  @SubscribeMessage('submitGuess')
  handleSubmitGuess(@MessageBody() dto: SubmitGuessDto, @ConnectedSocket() client: Socket) {
    const { code, id, guess } = dto;
    const { room, correct } = this.roomsService.submitGuess(code, id, guess);
    if(correct) {
      this.broadcastRoom(room);
    } else {
      this.server.to(id).emit('incorrectGuess');
    }
    client.emit('guessResult', { correct });
  }

  @SubscribeMessage('nextSong')
  handleNextSong(@MessageBody() dto: NextSongDto) {
    const { code, requesterId } = dto;
    
    const room = this.roomsService.nextSong(code, requesterId);
    // Status may now be 'finished': the public room (with scores) is the leaderboard
    this.broadcastRoom(room);
    // Does nothing once the game is finished (there is no current song)
    this.emitLoadSong(room);
  }

  @SubscribeMessage('resetRoom')
  handleResetRoom(@MessageBody() dto: ResetRoomDto) {
    const room = this.roomsService.resetRoom(dto.code, dto.requesterId);
    this.server.to(room.code).emit('roomReset');
    // Then: the fresh room, whose "configuring" status shows the lobby again
    this.broadcastRoom(room);
  }
}
