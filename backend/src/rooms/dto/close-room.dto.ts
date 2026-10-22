import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CloseRoomDto {
  @IsNotEmpty()
  @IsString()
  code: string;
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  id: string;
}
