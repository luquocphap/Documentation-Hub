import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TokenModule } from 'src/modules-system/token/token.module';

@Module({
  imports: [TokenModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
