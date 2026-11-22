import { Module } from "@nestjs/common";
import { RoomsController } from "./rooms.controller.js";
import { RoomsService } from "./rooms.service.js";
import { RoomsGateway } from "./rooms.gateway.js";
import { Shuffler } from "./shuffler.js";
import { Clock } from "./clock.js";
import { SongTimers } from "./song-timers.js";
import { RoomsRepository } from "./rooms.repository.js";
import { RedisRoomsRepository } from "./redis-rooms.repository.js";
import { RedisModule } from "../redis/redis.module.js";
@Module({
  imports: [RedisModule],
 controllers: [RoomsController],
 providers: [
  RoomsService,
  RoomsGateway,
  Shuffler,
  Clock,
  SongTimers,
  // "Whoever asks for RoomsRepository gets a RedisRoomsRepository."
  // Back to in-memory = useClass: InMemoryRoomsRepository (unit tests still use it).
  { provide: RoomsRepository, useClass: RedisRoomsRepository },
 ],
})

export class RoomsModule {}