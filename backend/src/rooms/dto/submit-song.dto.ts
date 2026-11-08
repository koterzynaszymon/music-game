import { IsString, IsNotEmpty, IsUUID, IsInt, Min, Max, IsObject } from 'class-validator';
import type { Song } from '../room.model.js';
export class SubmitSongDto {
  @IsNotEmpty()
  @IsString()
  code: string;
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  id: string;
  @IsObject()
  @IsNotEmpty()
  song: Song;
}
