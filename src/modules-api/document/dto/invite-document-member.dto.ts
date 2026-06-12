import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class InviteDocumentMemberDto {
  @IsNotEmpty()
  @IsEmail(undefined, { message: 'Email không hợp lệ' })
  @ApiProperty({ example: 'colleague@gmail.com' })
  email!: string;

  @IsNotEmpty()
  @IsString()
  @ApiProperty({ example: '111111111111111111111002', description: 'ID của Document Role (vd: Editor)' })
  roleId!: string;
}