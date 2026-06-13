import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsNotEmpty } from 'class-validator';

export class ChangeDocumentRoleDto {
  @IsNotEmpty()
  @IsMongoId()
  @ApiProperty({ example: '60a2b...1', description: 'ID của người dùng cần thay đổi vai trò' })
  userId!: string;

  @IsNotEmpty()
  @IsMongoId()
  @ApiProperty({ example: '111111111111111111111002', description: 'ID của Document Role mới' })
  roleId!: string;
}