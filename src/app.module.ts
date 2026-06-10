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
import { RedisModule } from './modules-system/redis/redis.module';
import { WorkspaceRole, WorkspaceRoleSchema } from './modules-api/workspace/schemas/workspace-roles.schema';
import { WorkspaceModule } from './modules-api/workspace/workspace.module';
import { WorkspaceRoleSeeder } from './common/seeds/role.seed';
import { PermissionGuard } from './common/guards/permission.guard';
import { WorkspaceMember, WorkspaceMemberSchema } from './modules-api/workspace/schemas/workspace_members.schema';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { User, UserSchema } from './modules-api/auth/schemas/user.schema';
import { DocumentModule } from './modules-api/document/document.module';
import { DocumentMember, DocumentMemberSchema } from './modules-api/document/schemas/document-members.schema';
import { DocumentRole, DocumentRoleSchema } from './modules-api/document/schemas/document-roles.schema';
import { DocumentRoleSeeder } from './common/seeds/document-role.seed';
import { PdfModule } from './modules-system/pdf/pdf.module';

@Module({
  imports: [
     EventEmitterModule.forRoot(),
     DatabaseModule,
     AuthModule,
     WorkspaceModule,
     TokenModule,
     RedisModule,
     PdfModule,
     MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: WorkspaceRole.name, schema: WorkspaceRoleSchema },
      { name: WorkspaceMember.name, schema: WorkspaceMemberSchema },
      { name: DocumentMember.name, schema: DocumentMemberSchema },
      { name: DocumentRole.name, schema: DocumentRoleSchema },
    ]),
     WorkspaceModule,
     DocumentModule,
    ],
  controllers: [AppController],
  providers: [
    AppService,
    WorkspaceRoleSeeder,
    DocumentRoleSeeder,
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
  constructor(
    private readonly roleSeeder: WorkspaceRoleSeeder,
    private readonly documentRoleSeeder: DocumentRoleSeeder
  ) {}

  async onApplicationBootstrap() {
    await this.roleSeeder.seed();
    await this.documentRoleSeeder.seed();
  }
}
