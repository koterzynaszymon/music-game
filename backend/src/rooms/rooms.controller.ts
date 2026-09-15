import { Body, Controller, Post } from "@nestjs/common";
import { CreateRoomDto } from "./dto/create-room.dto.js";
import { RoomsService } from "./rooms.service.js";
import { toPublicRoom } from "./room.model.js";

@Controller('rooms')
export class RoomsController {
    constructor(private readonly roomsService: RoomsService) {}

    @Post()
    createRoom(@Body() dto: CreateRoomDto) {
        const room = this.roomsService.createRoom(dto);
        return toPublicRoom(room);
    }
}