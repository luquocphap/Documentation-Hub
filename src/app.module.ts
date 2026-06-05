import { Module, OnApplicationBootstrap } from '@nestjs/common';
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
import { Role, RoleSchema } from './modules-system/database/schemas/roles.schema';
import { WorkspaceModule } from './modules-api/workspace/workspace.module';
import { RoleSeeder } from './common/seeds/role.seed';
import { PermissionGuard } from './common/guards/permission.guard';
import { WorkspaceMember, WorkspaceMemberSchema } from './modules-system/database/schemas/workspace_members.schema';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
     EventEmitterModule.forRoot(),
     DatabaseModule,
     AuthModule,
     WorkspaceModule,
     TokenModule,
     RedisModule,
     MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Role.name, schema: RoleSchema },
      { name: WorkspaceMember.name, schema: WorkspaceMemberSchema }
    ]),
     WorkspaceModule,
    ],
  controllers: [AppController],
  providers: [
    AppService,
    RoleSeeder,
    {
      provide: APP_GUARD,
      useClass: ProtectGuard
    },
    {
      provide: APP_GUARD,
      useClass: PermissionGuard
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
export class AppModule implements OnApplicationBootstrap {
  constructor(private readonly roleSeeder: RoleSeeder) {}

  async onApplicationBootstrap() {
    await this.roleSeeder.seed();
  }
}
