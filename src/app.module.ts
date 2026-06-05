import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules-api/auth/auth.module';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ProtectGuard } from './common/guards/protect.guard';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ResponseSuccessInterceptor } from './common/interceptors/response-success.interceptor';
import { TokenModule } from './modules-system/token/token.module';
import { DatabaseModule } from './modules-system/database/database.module';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from './modules-system/database/schemas/user.schema';
import { RedisModule } from './modules-system/redis/redis.module';

@Module({
  imports: [DatabaseModule,
     AuthModule,
     TokenModule,
     RedisModule,
     MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
    ]),
    ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ProtectGuard
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseSuccessInterceptor
    }
  ],
})
export class AppModule {}
