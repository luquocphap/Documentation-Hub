import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Workspace } from 'src/modules-system/database/schemas/workspaces.schema';
import { Model } from 'mongoose';
import { WorkspaceMember } from 'src/modules-system/database/schemas/workspace_members.schema';
import type { UserDocument } from 'src/modules-system/database/schemas/user.schema';
import { ROLE_IDS } from 'src/common/seeds/role.seed';

@Injectable()
export class WorkspaceService {
  constructor(
    @InjectModel(Workspace.name) private readonly workspaceModel: Model<Workspace>,
    @InjectModel(WorkspaceMember.name) private readonly workspaceMemberModel: Model<WorkspaceMember>,
  ) {}
  async create(createWorkspaceDto: CreateWorkspaceDto, user: UserDocument) {
    const { name, description } = createWorkspaceDto;

    const newWorkspace = await this.workspaceModel.create({
      name: name,
      description: description || null,
      memberCount: 1
    });

    const workspaceMember = await this.workspaceMemberModel.create({
      workspaceId: newWorkspace._id,
      userId: user._id,
      roleId: ROLE_IDS.ADMIN_WORKSPACE
    });

    return true;
  }

  async findAll(user: UserDocument) {
    // Lấy danh sách workspace của user với role name + số lượng members
    const workspacesWithRoles = await this.workspaceMemberModel
      .aggregate([
        // Lọc workspace của user hiện tại
        { $match: { userId: user._id } },

        // Lookup workspace info
        {
          $lookup: {
            from: 'workspaces',
            localField: 'workspaceId',
            foreignField: '_id',
            as: 'workspace'
          }
        },
        { $unwind: '$workspace' },

        // Lookup role name
        {
          $lookup: {
            from: 'roles',
            localField: 'roleId',
            foreignField: '_id',
            as: 'role'
          }
        },
        { $unwind: '$role' },

        // Chỉ lấy các field cần thiết
        {
          $project: {
            _id: '$workspace._id',
            workspaceName: '$workspace.name',
            workspaceDescription: '$workspace.description',
            createdAt: '$workspace.created_at',
            userRole: '$role.name',
            memberCount: '$workspace.memberCount',
            joinedAt: 1
          }
        }
      ])
      .exec();

    return workspacesWithRoles;
  }

  async update(id: string, updateWorkspaceDto: UpdateWorkspaceDto) {
    const { name, description } = updateWorkspaceDto;
    
    // Tự động cập nhật updatedAt
    const updatedWorkspace = await this.workspaceModel.findByIdAndUpdate(
      id,
      { name, description },
      { new: true } // trả về workspace mới
    ).exec();

    if (!updatedWorkspace || updatedWorkspace.isDeleted) {
      throw new NotFoundException('Workspace không tồn tại hoặc đã bị xóa');
    }

    return updatedWorkspace;
  }

  remove(id: string, user: UserDocument) {
    return `This action removes a #${id} workspace`;
  }
}
