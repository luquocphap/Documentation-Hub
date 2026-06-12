import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsMongoId, IsOptional, IsString } from 'class-validator';

export class SearchUserDto {
  @IsString()
  @ApiPropertyOptional({ description: 'Từ khóa email để tìm kiếm' })
  keyword!: string;

  @IsOptional()
  @IsMongoId()
  @ApiPropertyOptional({ description: 'Truyền vào nếu muốn check user đã trong workspace này chưa' })
  workspaceId?: string;

  @IsOptional()
  @IsMongoId()
  @ApiPropertyOptional({ description: 'Truyền vào nếu muốn check user đã trong document này chưa' })
  documentId?: string;
}