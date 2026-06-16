import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateCommentReplyDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(5000)
  @ApiProperty({
    description: 'Noi dung reply',
    example: 'Minh dong y voi y kien nay',
  })
  text!: string;
}

export class UpdateCommentReplyDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(5000)
  @ApiProperty({
    description: 'Noi dung reply sau khi chinh sua',
    example: 'Minh cap nhat lai y kien nay',
  })
  text!: string;
}
