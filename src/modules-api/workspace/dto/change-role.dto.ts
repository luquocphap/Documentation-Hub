import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ChangeRoleDto {
  @IsNotEmpty()
  @IsString()
  @ApiProperty({ example: '60a2b...1' })
  userId!: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({ example: '000000000000000000000002' })
  roleId!: string;
}