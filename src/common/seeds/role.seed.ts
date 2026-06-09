import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { WorkspaceRole, WorkspaceRoleAction, WorkspaceRoleResource } from 'src/modules-api/workspace/schemas/workspace-roles.schema';

export const ROLE_IDS = {
  ADMIN_WORKSPACE:  new Types.ObjectId('000000000000000000000001'),
  MEMBER_WORKSPACE: new Types.ObjectId('000000000000000000000002'),
};

@Injectable()
export class WorkspaceRoleSeeder {
  constructor(
    @InjectModel(WorkspaceRole.name) private readonly roleModel: Model<WorkspaceRole>,
  ) {}

  async seed() {
    const roles = [
      {
        _id: ROLE_IDS.ADMIN_WORKSPACE,
        name: 'Admin',
        description: "Can manage settings & members",
        permissions: [
          { action: WorkspaceRoleAction.VIEW,    resource: WorkspaceRoleResource.WORKSPACE },
          { action: WorkspaceRoleAction.EDIT,    resource: WorkspaceRoleResource.WORKSPACE },
          { action: WorkspaceRoleAction.DELETE,  resource: WorkspaceRoleResource.WORKSPACE },
          { action: WorkspaceRoleAction.INVITE,  resource: WorkspaceRoleResource.MEMBER },
          { action: WorkspaceRoleAction.REMOVE,  resource: WorkspaceRoleResource.MEMBER },
        ],
      },
      {
        _id: ROLE_IDS.MEMBER_WORKSPACE,
        name: 'Member',
        description: "Can create & edit documents",
        permissions: [
          { action: WorkspaceRoleAction.VIEW,    resource: WorkspaceRoleResource.WORKSPACE },
          { action: WorkspaceRoleAction.COMMENT, resource: WorkspaceRoleResource.WORKSPACE },
        ],
      },
    ];

    for (const role of roles) {
        // Tách _id ra khỏi phần dữ liệu dùng để update
        const { _id, ...updateData } = role;

        await this.roleModel.updateOne(
          { _id: _id },           
          { $set: updateData },
          { upsert: true },
        );
    }

    console.log('✅ WorkspaceRoles seeded successfully');
  }
}