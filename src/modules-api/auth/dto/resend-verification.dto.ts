import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches } from 'class-validator';
import { WORKSPACE_REDIRECT_PATTERN } from '../utils/workspace-redirect.util';

export class ResendVerificationDto {
  @IsEmail(undefined, { message: 'Invalid email address' })
  @ApiProperty({ example: 'member@example.com' })
  email!: string;

  @IsOptional()
  @IsString()
  @Matches(WORKSPACE_REDIRECT_PATTERN, {
    message: 'redirectTo must be an internal workspace path',
  })
  @ApiPropertyOptional({
    example: '%2Fworkspaces%2F000000000000000000000001',
  })
  redirectTo?: string;
}
