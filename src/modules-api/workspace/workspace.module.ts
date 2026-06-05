import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WorkspaceService } from './workspace.service';
import { WorkspaceController } from './workspace.controller';
import { Workspace, WorkspaceSchema } from 'src/modules-system/database/schemas/workspaces.schema';
import { WorkspaceMember, WorkspaceMemberSchema } from 'src/modules-system/database/schemas/workspace_members.schema';
import { User, UserSchema } from 'src/modules-system/database/schemas/user.schema';
import { Role, RoleSchema } from 'src/modules-system/database/schemas/roles.schema';
import { WorkspaceInvitation, WorkspaceInvitationSchema } from 'src/modules-system/database/schemas/workspace-invitation.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Workspace.name, schema: WorkspaceSchema },
      { name: WorkspaceMember.name, schema: WorkspaceMemberSchema },
      { name: WorkspaceInvitation.name, schema: WorkspaceInvitationSchema },
      { name: User.name, schema: UserSchema },
      { name: Role.name, schema: RoleSchema },
    ]),
  ],
  controllers: [WorkspaceController],
  providers: [WorkspaceService],
})
export class WorkspaceModule {}
