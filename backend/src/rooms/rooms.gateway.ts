import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { RoomsService } from './rooms.service.js';
import {
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { JoinRoomDto } from './dto/join-room.dto.js';
import { toPublicRoom } from './room.model.js';
import { ChangePlayerReadyStatusDto } from './dto/change-player-ready-status.dto.js';
import { KickPlayerDto } from './dto/kick-player.dto.js';
import { LeaveRoomDto } from './dto/leave-room.dto.js';
import { CloseRoomDto } from './dto/close-room.dto.js';
import { SetSongsPerPlayerDto } from './dto/set-songs-per-player.dto.js';
import { SubmitSongDto } from './dto/submit-song.dto.js';


@WebSocketGateway({ cors: { origin: '*' } })
export class RoomsGateway {
  @WebSocketServer() server: Server;

  constructor(private readonly roomsService: RoomsService) {}
  @SubscribeMessage('joinRoom')
  handleJoinRoom(
    @MessageBody() dto: JoinRoomDto,
    @ConnectedSocket() client: Socket,
  ) {
    const { code, id, nickname } = dto;
    try {
      const { room, isNewPlayer } = this.roomsService.joinRoom(
        code,
        id,
        nickname,
      );

      client.join(room.code);
      client.join(id);
      if (isNewPlayer) {
        this.server.to(room.code).emit('roomUpdated', toPublicRoom(room));
      }

      client.emit('roomJoined', {
        room: toPublicRoom(room),
        isNewPlayer: isNewPlayer,
      });
    } catch (error) {
      // Dedicated event: the client is not in the room, so it should leave the room page instead of staying on an empty one
      client.emit('joinRejected', {
        message: (error as Error).message,
      });
      return;
    }
  }

  @SubscribeMessage('changePlayerReadyStatus')
  handleChangePlayerReadyStatus(
    @MessageBody() dto: ChangePlayerReadyStatusDto,
    @ConnectedSocket() client: Socket,
  ) {
    const { code, id } = dto;
    try {
      const room = this.roomsService.changePlayerReadyStatus(code, id);
      this.server.to(room.code).emit('roomUpdated', toPublicRoom(room));
    } catch (error) {
      client.emit('error', {
        message: (error as Error).message,
      });
      return;
    }
  }

  @SubscribeMessage('kickPlayer')
  handleKickPlayer(
    @MessageBody() dto: KickPlayerDto,
    @ConnectedSocket() client: Socket,
  ) {
    const { code, requesterId, targetId } = dto;
    try {
      const room = this.roomsService.kickPlayer(code, requesterId, targetId);
      this.server.to(targetId).emit('kicked');
      this.server.to(room.code).emit('roomUpdated', toPublicRoom(room));
    } catch (error) {
      client.emit('error', {
        message: (error as Error).message,
      });
      return;
    }
  }

  @SubscribeMessage('leaveRoom')
  handleLeaveRoom(
    @MessageBody() dto: LeaveRoomDto,
    @ConnectedSocket() client: Socket,
  ) {
    const {code, id} = dto;
    try{
      const room = this.roomsService.leaveRoom(code, id);
      this.server.to(id).emit('leftRoom');
      this.server.to(room.code).emit('roomUpdated', toPublicRoom(room));
      client.leave(room.code);
      client.leave(id);
    } catch (error) {
      client.emit('error', {
        message: (error as Error).message,
      });
      return;
    }
  }
  
  @SubscribeMessage('closeRoom')
  handleCloseRoom(
    @MessageBody() dto: CloseRoomDto,
    @ConnectedSocket() client: Socket,
  ) {
    const {code, id} = dto;
    try {
      const room = this.roomsService.closeRoom(code, id);
      client.to(room.code).emit('roomClosed');
      this.server.in(room.code).socketsLeave(room.code);
    } catch (error) {
      client.emit('error', {
        message: (error as Error).message,
      });
      return;
    }
  }

  @SubscribeMessage('setSongsPerPlayer')
  handleSetSongsPerPlayer(
    @MessageBody() dto: SetSongsPerPlayerDto,
    @ConnectedSocket() client: Socket,
  ) {
    const { code, requesterId, songsPerPlayer } = dto;
    try {
      const room = this.roomsService.setSongsPerPlayer(
        code,
        requesterId,
        songsPerPlayer,
      );
      this.server.to(room.code).emit('roomUpdated', toPublicRoom(room));
    } catch (error) {
      client.emit('error', {
        message: (error as Error).message,
      });
      return;
    }
  }
  @SubscribeMessage('submitSong')
  handleSubmitSong(
    @MessageBody() dto: SubmitSongDto,
    @ConnectedSocket() client: Socket,
  ) {
    const { code, id, song } = dto;
    try {
      const room = this.roomsService.submitSong(code, id, song);
      this.server.to(room.code).emit('roomUpdated', toPublicRoom(room));
      client.emit('songSubmitted', {
        song: song,
      });
    } catch (error) {
      client.emit('error', {
        message: (error as Error).message,
      });
      return;
    }
  }
}
