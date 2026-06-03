import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { TokenModule } from 'src/modules-system/token/token.module';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from 'src/modules-system/database/schemas/user.schema';
import { RefreshToken, RefreshTokenSchema } from 'src/modules-system/database/schemas/refresh-token.schema';
import { VerificationToken, VerificationTokenSchema } from 'src/modules-system/database/schemas/verification-token.schema';

@Module({
  imports: [
    TokenModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: RefreshToken.name, schema: RefreshTokenSchema },
      { name: VerificationToken.name, schema: VerificationTokenSchema }
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
