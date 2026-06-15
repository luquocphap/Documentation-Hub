import { Type } from 'class-transformer';
import { IsOptional, ValidateNested } from 'class-validator';
import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  CreateDocumentAnnotationDto,
  CreateDocumentCommentDto,
} from './create-document-comment.dto';

export class UpdateDocumentAnnotationDto extends PartialType(
  CreateDocumentAnnotationDto,
) {}

class UpdateDocumentCommentBaseDto extends PartialType(
  OmitType(CreateDocumentCommentDto, ['annotation'] as const),
) {}

export class UpdateDocumentCommentDto extends UpdateDocumentCommentBaseDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateDocumentAnnotationDto)
  @ApiPropertyOptional({ type: UpdateDocumentAnnotationDto })
  annotation?: UpdateDocumentAnnotationDto;
}
