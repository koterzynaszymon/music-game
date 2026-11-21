import { IsString, IsNotEmpty, IsUUID } from 'class-validator';
export class ResetRoomDto {
  @IsString()
  @IsNotEmpty()
  code: string;
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  requesterId: string;
}
