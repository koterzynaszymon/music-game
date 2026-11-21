import { Module } from "@nestjs/common";
import { RoomsController } from "./rooms.controller.js";
import { RoomsService } from "./rooms.service.js";
import { RoomsGateway } from "./rooms.gateway.js";
import { Shuffler } from "./shuffler.js";
import { Clock } from "./clock.js";
@Module({
 controllers: [RoomsController],
 providers: [RoomsService, RoomsGateway, Shuffler, Clock],
})

export class RoomsModule {}