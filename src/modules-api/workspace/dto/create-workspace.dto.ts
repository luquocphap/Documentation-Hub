import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, MaxLength } from "class-validator";

export class CreateWorkspaceDto {
    @IsNotEmpty()
    @MaxLength(60)
    @ApiProperty({ description: "Tên Workspace", example: "Lumin Team Workspace" })
    name!: string;

    @ApiProperty({ description: "Mô tả workspace", example: "Nơi tập hợp tài liệu dev" })
    description?: string;
}
