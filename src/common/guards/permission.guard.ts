import { Injectable, CanActivate, ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { WorkspaceRole } from 'src/modules-api/workspace/schemas/workspace-roles.schema';
import { WorkspaceMember } from 'src/modules-api/workspace/schemas/workspace_members.schema';
import { DocumentRole } from 'src/modules-api/document/schemas/document-roles.schema';
import { DocumentMember } from 'src/modules-api/document/schemas/document-members.schema';
import { PERMISSION_KEY } from '../decorators/permission.decorator';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectModel(WorkspaceRole.name) private workspaceRoleModel: Model<WorkspaceRole>,
    @InjectModel(WorkspaceMember.name) private workspaceMemberModel: Model<WorkspaceMember>,
    @InjectModel(DocumentRole.name) private documentRoleModel: Model<DocumentRole>,
    @InjectModel(DocumentMember.name) private documentMemberModel: Model<DocumentMember>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return true;
    }
    const requiredPermission = this.reflector.getAllAndOverride<[string, string]>(
      PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermission) return true;

    const [action, resource] = requiredPermission;
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) throw new ForbiddenException('Không thể xác thực User');

    // KIỂM TRA QUYỀN ĐỔI VỚI WORKSPACE
    if (['WORKSPACE', 'MEMBER'].includes(resource)) {
      const workspaceId = request.params?.workspaceId || request.query?.workspaceId || request.body?.workspaceId;
      if (!workspaceId) throw new ForbiddenException('Missing workspaceId in request');

      if (!Types.ObjectId.isValid(workspaceId)) {
        throw new NotFoundException('Workspace không tồn tại');
      }

      const member = await this.workspaceMemberModel.findOne({
        userId: new Types.ObjectId(user._id),
        workspaceId: new Types.ObjectId(workspaceId as string),
        isDeleted: { $ne: true }
      }).exec();

      if (!member) throw new ForbiddenException('Bạn không phải là thành viên của Workspace này');

      const role = await this.workspaceRoleModel.findById(member.roleId).exec();
      if (!role) throw new ForbiddenException('WorkspaceRole không tồn tại');

      const hasPermission = role.permissions.some(p => p.action === action && p.resource === resource);
      if (!hasPermission) throw new ForbiddenException('Bạn không có quyền thực hiện hành động này trong Workspace');
      
      return true;
    }

    // KIỂM TRA QUYỀN ĐỐI VỚI DOCUMENT
    if (['DOCUMENT'].includes(resource)) {
      const documentId = request.params?.documentId || request.query?.documentId || request.body?.documentId;
      if (!documentId) throw new ForbiddenException('Missing documentId in request');

      if (!Types.ObjectId.isValid(documentId)) {
        throw new NotFoundException('Tài liệu không tồn tại');
      }

      const member = await this.documentMemberModel.findOne({
        userId: new Types.ObjectId(user._id),
        documentId: new Types.ObjectId(documentId as string),
        isDeleted: { $ne: true }
      }).exec();

      if (!member) throw new ForbiddenException('Bạn không có quyền truy cập tài liệu này');

      const role = await this.documentRoleModel.findById(member.roleId).exec();
      if (!role) throw new ForbiddenException('DocumentRole không tồn tại');

      const hasPermission = role.permissions.some(p => p.action === action && p.resource === resource);
      if (!hasPermission) throw new ForbiddenException('Bạn không có quyền thực hiện hành động này trên tài liệu');

      return true;
    }

    return false;
  }
}