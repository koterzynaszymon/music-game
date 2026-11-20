import { IsString, IsNotEmpty, IsUUID } from 'class-validator';
export class SubmitGuessDto {
  @IsString()
  @IsNotEmpty()
  code: string;
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  id: string;
  @IsString()
  @IsNotEmpty()
  guess: string;
}