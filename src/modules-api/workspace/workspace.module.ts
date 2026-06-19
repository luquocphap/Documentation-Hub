import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorkspaceService } from './workspace.service';
import { WorkspaceController } from './workspace.controller';
import { Workspace, WorkspaceSchema } from 'src/modules-api/workspace/schemas/workspaces.schema';
import { WorkspaceMember, WorkspaceMemberSchema } from 'src/modules-api/workspace/schemas/workspace_members.schema';
import { WorkspaceRole, WorkspaceRoleSchema } from 'src/modules-api/workspace/schemas/workspace-roles.schema';
import { WorkspaceInvitation, WorkspaceInvitationSchema } from 'src/modules-api/workspace/schemas/workspace-invitation.schema';
import { User, UserSchema } from 'src/modules-api/auth/schemas/user.schema';
import { DocumentModel, DocumentSchema } from '../document/schemas/documents.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Workspace.name, schema: WorkspaceSchema },
      { name: WorkspaceMember.name, schema: WorkspaceMemberSchema },
      { name: WorkspaceInvitation.name, schema: WorkspaceInvitationSchema },
      { name: User.name, schema: UserSchema },
      { name: WorkspaceRole.name, schema: WorkspaceRoleSchema },
      { name: DocumentModel.name, schema: DocumentSchema }
    ]),
  ],
  controllers: [WorkspaceController],
  providers: [WorkspaceService],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}
