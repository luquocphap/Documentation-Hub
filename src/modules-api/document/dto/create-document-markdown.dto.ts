import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateDocumentMarkdownDto {
  @IsNotEmpty()
  @IsMongoId()
  @ApiProperty({ description: 'ID của Workspace' })
  workspaceId!: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  @ApiProperty({ description: 'Tên tài liệu', example: 'Tài liệu hướng dẫn API' })
  title!: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({ description: 'Nội dung Markdown', example: '# Tiêu đề chính\n## Mục 1\nNội dung...' })
  markdownContent!: string;
}