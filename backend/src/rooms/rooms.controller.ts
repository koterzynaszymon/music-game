import { Body, Controller, Get, NotFoundException, Param, Post } from "@nestjs/common";
import { CreateRoomDto } from "./dto/create-room.dto.js";
import { RoomsService } from "./rooms.service.js";
import { toPublicRoom } from "./room.model.js";

@Controller('rooms')
export class RoomsController {
    constructor(private readonly roomsService: RoomsService) {}

    @Post()
    async createRoom(@Body() dto: CreateRoomDto) {
        const room = await this.roomsService.createRoom(dto);
        return toPublicRoom(room);
    }
    @Get(':code')
    async getRoom(@Param('code') code: string) {
        const room = await this.roomsService.findRoomByCode(code);
        return toPublicRoom(room);
    }
}