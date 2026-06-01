import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty } from "class-validator";

export class LoginBody {
    @IsNotEmpty()
    @ApiProperty({example: "phap@gmail.com"})
    @IsEmail(undefined, {message: "email error"})
    email!: string;

    @IsNotEmpty()
    @ApiProperty({example: "123456"})
    password!: string;
}