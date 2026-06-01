import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty, IsOptional } from "class-validator";

export class RegisterBody {
    @IsNotEmpty()
    @IsEmail(undefined, { message: "Invalid Email" })
    @ApiProperty({ example: "luphap@gmail.com" })
    email!: string;

    @IsNotEmpty()
    @ApiProperty({ example: "123456" })
    password!: string;

    @IsNotEmpty()
    @ApiProperty({ example: "Lu Quoc Phap"})
    fullName!: string;
}