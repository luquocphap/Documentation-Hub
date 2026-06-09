import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateDocumentDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  @ApiProperty({ description: 'Tên tài liệu mới', example: 'Quy trình Onboarding (Mới)' })
  title!: string;
}