import { ApiProperty } from "@nestjs/swagger";
import {
    isEmail,
    IsNotEmpty,
    Length,
    registerDecorator,
    ValidationOptions,
} from "class-validator";

function IsEmailWhenNotEmpty(validationOptions?: ValidationOptions) {
    return function (object: object, propertyName: string) {
        registerDecorator({
            name: "isEmailWhenNotEmpty",
            target: object.constructor,
            propertyName,
            options: validationOptions,
            validator: {
                validate(value: unknown) {
                    if (value === undefined || value === null || value === "") {
                        return true;
                    }

                    return typeof value === "string" && isEmail(value);
                },
            },
        });
    };
}

export class RegisterBody {
    @IsNotEmpty({message: "Mandatory field"})
    @ApiProperty({
        description: "User email address",
         example: "luphap@gmail.com",
         format: "email",
    })
    @IsEmailWhenNotEmpty({ message: "Invalid email address" })
    @ApiProperty({ example: "luphap@gmail.com" })
    email!: string;

    @IsNotEmpty({message: "Mandatory field"})
    @Length(8)
    @ApiProperty({ example: "12345678" })
    password!: string;

    @IsNotEmpty({message: "Mandatory field"})
    @ApiProperty({ example: "Lu Quoc Phap"})
    fullName!: string;
}
