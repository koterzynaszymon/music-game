import { Module } from "@nestjs/common";
import { RoomsController } from "./rooms.controller.js";
import { RoomsService } from "./rooms.service.js";
import { RoomsGateway } from "./rooms.gateway.js";
@Module({
 controllers: [RoomsController],
 providers: [RoomsService, RoomsGateway],
})

export class RoomsModule {}