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
import {
  DocumentMember,
  DocumentMemberSchema,
} from 'src/modules-api/document/schemas/document-members.schema';
import {
  DocumentRole,
  DocumentRoleSchema,
} from 'src/modules-api/document/schemas/document-roles.schema';

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
      {
        name: DocumentMember.name,
        schema: DocumentMemberSchema,
      },
      {
        name: DocumentRole.name,
        schema: DocumentRoleSchema,
      },
    ]),
  ],
  providers: [SocketAuthService, SocketGateway],
  exports: [SocketGateway],
})
export class SocketModule {}
