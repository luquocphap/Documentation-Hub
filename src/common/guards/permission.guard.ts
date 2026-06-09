import { 
  Injectable, 
  CanActivate, 
  ExecutionContext, 
  ForbiddenException 
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Permission, WorkspaceRole, WorkspaceRoleDocument } from 'src/modules-api/workspace/schemas/workspace-roles.schema';
import { WorkspaceMember } from 'src/modules-api/workspace/schemas/workspace_members.schema';
import { PERMISSION_KEY } from '../decorators/permission.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectModel(WorkspaceRole.name) private roleModel: Model<WorkspaceRoleDocument>,
    @InjectModel(WorkspaceMember.name) private memberModel: Model<WorkspaceMember>, 
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermission = this.reflector.getAllAndOverride<Permission>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Nếu API không gắn decorator @Permission, cho phép đi qua
    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    
    const workspaceId = request.params.workspaceId;
    if (!user || !workspaceId) {
      throw new ForbiddenException('Không thể xác thực ngữ cảnh Workspace hoặc User');
    }

    const member = await this.memberModel.findOne({
      userId: new Types.ObjectId(user._id),
      workspaceId: new Types.ObjectId(workspaceId as string),
    }).exec();


    if (!member) {
      throw new ForbiddenException('Bạn không phải là thành viên của Workspace này');
    }

    const role = await this.roleModel.findById(member.roleId).exec();

    if (!role) {
      throw new ForbiddenException('WorkspaceRole không tồn tại');
    }

    const hasPermission = role.permissions.some(
      (p) => p.action === requiredPermission[0] && 
        p.resource === requiredPermission[1]
    );

    if (!hasPermission) {
      throw new ForbiddenException('Bạn không có quyền thực hiện hành động này');
    }

    return true;
  }
}