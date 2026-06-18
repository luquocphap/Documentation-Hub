import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from 'src/modules-api/auth/schemas/user.schema';
import {
  WorkspaceMember,
  WorkspaceMemberSchema,
} from 'src/modules-api/workspace/schemas/workspace_members.schema';
import {
  WorkspaceRole,
  WorkspaceRoleSchema,
} from 'src/modules-api/workspace/schemas/workspace-roles.schema';
import { TokenModule } from '../token/token.module';
import { SocketAuthService } from './socket-auth.service';
import { SocketGateway } from './socket.gateway';

@Module({
  imports: [
    TokenModule,
    MongooseModule.forFeature([
      {
        name: User.name,
        schema: UserSchema,
      },
      {
        name: WorkspaceMember.name,
        schema: WorkspaceMemberSchema,
      },
      {
        name: WorkspaceRole.name,
        schema: WorkspaceRoleSchema,
      },
    ]),
  ],
  providers: [SocketAuthService, SocketGateway],
  exports: [SocketGateway],
})
export class SocketModule {}