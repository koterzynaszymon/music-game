import { IsString, IsNotEmpty, IsUUID } from 'class-validator';
export class SongLoadedDto {
  @IsNotEmpty()
  @IsString()
  code: string;
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  id: string;
}