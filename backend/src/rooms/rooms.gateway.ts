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
      if(isNewPlayer) {
        this.server.to(room.code).emit('roomUpdated', toPublicRoom(room));
      }

      client.emit('roomJoined', {
        room: toPublicRoom(room),
        isNewPlayer: isNewPlayer,
      });

    } catch (error) {
      client.emit('error', {
        message: (error as Error).message,
      });
      return;
    }
  }
}
