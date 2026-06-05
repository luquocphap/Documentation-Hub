import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class InviteMemberDto {
  @IsNotEmpty()
  @IsEmail(undefined, { message: 'Email không hợp lệ' })
  @ApiProperty({ example: 'colleague@gmail.com' })
  email!: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({ example: '000000000000000000000002', description: 'ID của Role' })
  roleId!: string;
}