import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './modules-system/prisma/prisma.module';
import { AuthModule } from './modules-api/auth/auth.module';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ProtectGuard } from './common/guards/protect.guard';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ResponseSuccessInterceptor } from './common/interceptors/response-success.interceptor';
import { TokenModule } from './modules-system/token/token.module';

@Module({
  imports: [PrismaModule, AuthModule, TokenModule],
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
