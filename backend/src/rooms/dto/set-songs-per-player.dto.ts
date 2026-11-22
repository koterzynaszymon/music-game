import { IsString, IsNotEmpty, IsUUID, IsInt, Min, Max } from 'class-validator';
import {
  MAX_SONG_DURATION,
  MAX_SONGS_PER_PLAYER,
  MIN_SONG_DURATION,
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
  // Seconds each song plays before the answer is revealed
  @IsInt()
  @Min(MIN_SONG_DURATION)
  @Max(MAX_SONG_DURATION)
  songDuration: number;
}
