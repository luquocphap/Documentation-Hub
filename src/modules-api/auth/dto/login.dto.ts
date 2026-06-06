import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, isValidationOptions } from "class-validator";
import { IsEmailWhenNotEmpty } from "src/common/decorators/is-email-when-not-empty.decorator";
import { IsLengthWhenNotEmpty } from "src/common/decorators/is-length-when-not-empty.decorator";

export class LoginBody {
    @IsNotEmpty({message: "Mandatory field"})
    @ApiProperty({
        description: "User email address",
         example: "luphap@gmail.com",
         format: "email",
    })
    @IsEmailWhenNotEmpty({message: "Invalid email address"})
    email!: string;

    @IsNotEmpty({message: "Mandatory field"})
    @ApiProperty({example: "123456"})
    password!: string;
}
