import { IsString, IsNotEmpty} from 'class-validator';
import { IsUUID } from 'class-validator';
export class ChangePlayerReadyStatusDto {
  @IsNotEmpty()
  @IsString()
  code: string;
  @IsUUID()
  @IsNotEmpty()
  id: string;
}
