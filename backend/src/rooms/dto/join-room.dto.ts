import { IsNotEmpty, IsString } from "class-validator";

export class JoinRoomDto {
    @IsString()
    @IsNotEmpty()
    code: string;
    @IsString()
    @IsNotEmpty()
    id: string;
    @IsString()
    @IsNotEmpty()
    nickname: string;
}