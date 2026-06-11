import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateDocumentDto {
  @IsNotEmpty()
  @IsMongoId()
  @ApiProperty({ description: 'ID của Workspace' })
  workspaceId!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  @ApiProperty({ description: 'Tên tài liệu', example: 'Quy trình Onboarding' })
  title!: string;
}