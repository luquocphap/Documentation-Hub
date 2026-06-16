import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DocumentCommentStatus } from '../schemas/document-comments.schema';

export class CreateDocumentAnnotationDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({ example: 'annotation-1734259200000' })
  annotationId!: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({ example: 'HIGHLIGHT' })
  type!: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @ApiProperty({ example: 1 })
  pageNumber!: number;

  @IsOptional()
  @IsArray()
  @ApiPropertyOptional({
    example: [
      {
        x1: 120,
        y1: 240,
        x2: 360,
        y2: 240,
        x3: 120,
        y3: 260,
        x4: 360,
        y4: 260,
      },
    ],
  })
  quads?: Record<string, any>[];

  @IsOptional()
  @IsObject()
  @ApiPropertyOptional({ example: { x: 120, y: 240, width: 240, height: 20 } })
  rect?: Record<string, any>;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ example: 'Important section' })
  contents?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ example: '#FFEB3B' })
  color?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  @ApiPropertyOptional({ example: 0.8 })
  opacity?: number;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({ example: '<xfdf>...</xfdf>' })
  xfdf?: string;
}

export class CreateDocumentCommentDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(5000)
  @ApiProperty({
    description: 'Nội dung comment',
    example: 'Đoạn này cần bổ sung nguồn tham khảo',
  })
  text!: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description: 'Đoạn text đang được chọn trong PDF',
    example: 'This agreement shall...',
  })
  selectedText?: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @ApiProperty({ description: 'Số trang trong tài liệu', example: 1 })
  pageNumber!: number;

  @IsOptional()
  @IsEnum(DocumentCommentStatus)
  @ApiPropertyOptional({
    enum: DocumentCommentStatus,
    default: DocumentCommentStatus.OPEN,
  })
  status?: DocumentCommentStatus;

  @IsOptional()
  @IsMongoId()
  @ApiPropertyOptional({ description: 'Mongo ID của annotation đã lưu' })
  annotationRef?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional({
    description: 'ID annotation từ PDF viewer',
    example: 'annotation-1734259200000',
  })
  annotationId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateDocumentAnnotationDto)
  @ApiPropertyOptional({ type: CreateDocumentAnnotationDto })
  annotation?: CreateDocumentAnnotationDto;
}
