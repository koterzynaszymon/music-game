import { IsNotEmpty, IsString, IsUUID } from "class-validator";

export class LeaveRoomDto {
  @IsNotEmpty()
  @IsString()
  code: string;
  @IsString()
  @IsNotEmpty()
  @IsUUID()
  id: string;
}