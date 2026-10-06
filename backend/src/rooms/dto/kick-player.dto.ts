import { IsString, IsNotEmpty } from 'class-validator';
import { IsUUID } from 'class-validator';
export class KickPlayerDto {
  @IsNotEmpty()
  @IsString()
  code: string;
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  targetId: string;
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  requesterId: string;
}
