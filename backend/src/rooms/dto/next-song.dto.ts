import { IsString, IsNotEmpty, IsUUID } from 'class-validator';
export class NextSongDto {
  @IsString()
  @IsNotEmpty()
  code: string;
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  requesterId: string;
}