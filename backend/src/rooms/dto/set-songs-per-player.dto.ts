import { IsString, IsNotEmpty, IsUUID, IsInt, Min, Max } from 'class-validator';
import {
  MAX_SONGS_PER_PLAYER,
  MIN_SONGS_PER_PLAYER,
} from '../room.model.js';

export class SetSongsPerPlayerDto {
  @IsNotEmpty()
  @IsString()
  code: string;
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  requesterId: string;
  @IsInt()
  @Min(MIN_SONGS_PER_PLAYER)
  @Max(MAX_SONGS_PER_PLAYER)
  songsPerPlayer: number;
}
