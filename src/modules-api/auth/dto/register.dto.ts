import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty } from "class-validator";
import { IsEmailWhenNotEmpty } from "src/common/decorators/is-email-when-not-empty.decorator";
import { IsLengthWhenNotEmpty } from "src/common/decorators/is-length-when-not-empty.decorator";

export class RegisterBody {
    @IsNotEmpty({message: "Mandatory field"})
    @ApiProperty({
        description: "User email address",
         example: "luphap@gmail.com",
         format: "email",
    })
    @IsEmailWhenNotEmpty({ message: "Invalid Email" })
    @ApiProperty({ example: "luphap@gmail.com" })
    email!: string;

    @IsNotEmpty({message: "Mandatory field"})
    @IsLengthWhenNotEmpty(8)
    @ApiProperty({ example: "12345678" })
    password!: string;

    @IsNotEmpty({message: "Mandatory field"})
    @ApiProperty({ example: "Lu Quoc Phap"})
    fullName!: string;
}
