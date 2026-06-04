import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Role, RoleAction, RoleResource } from 'src/modules-system/database/schemas/roles.schema';

export const ROLE_IDS = {
  ADMIN_WORKSPACE:  new Types.ObjectId('000000000000000000000001'),
  MEMBER_WORKSPACE: new Types.ObjectId('000000000000000000000002'),
};

@Injectable()
export class RoleSeeder {
  constructor(
    @InjectModel(Role.name) private readonly roleModel: Model<Role>,
  ) {}

  async seed() {
    const roles = [
      {
        _id: ROLE_IDS.ADMIN_WORKSPACE,
        name: 'Admin Workspace',
        permissions: [
          { action: RoleAction.VIEW,    resource: RoleResource.WORKSPACE },
          { action: RoleAction.EDIT,    resource: RoleResource.WORKSPACE },
          { action: RoleAction.DELETE,  resource: RoleResource.WORKSPACE },
          { action: RoleAction.INVITE,  resource: RoleResource.MEMBER },
          { action: RoleAction.REMOVE,  resource: RoleResource.MEMBER },
        ],
      },
      {
        _id: ROLE_IDS.MEMBER_WORKSPACE,
        name: 'Member Workspace',
        permissions: [
          { action: RoleAction.VIEW,    resource: RoleResource.WORKSPACE },
          { action: RoleAction.COMMENT, resource: RoleResource.WORKSPACE },
        ],
      },
    ];

    for (const role of roles) {
      await this.roleModel.updateOne(
        { name: role.name },      // filter: tìm theo tên
        { $set: role },           // nếu có thì update
        { upsert: true },         // nếu chưa có thì insert
      );
    }

    console.log('✅ Roles seeded successfully');
  }
}