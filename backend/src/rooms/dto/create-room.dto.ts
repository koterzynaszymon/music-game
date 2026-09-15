import { IsString, IsNotEmpty, Length } from 'class-validator';
import { IsUUID } from 'class-validator';

export class CreateRoomDto {
  @IsNotEmpty()
  @IsUUID()
  id: string;
  @IsString()
  @IsNotEmpty()
  @Length(3, 10)
  nickname: string;
}