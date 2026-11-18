import { IsString, IsNotEmpty, IsUUID } from 'class-validator';
export class StartGameDto {
  @IsNotEmpty()
  @IsString()
  code: string;
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  requesterId: string;
}