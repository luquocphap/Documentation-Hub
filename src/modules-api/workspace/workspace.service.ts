import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Workspace } from 'src/modules-api/workspace/schemas/workspaces.schema';
import { Model, Types } from 'mongoose';
import { WorkspaceMember } from 'src/modules-api/workspace/schemas/workspace_members.schema';
import { ROLE_IDS } from 'src/common/seeds/role.seed';
import { InvitationStatus, WorkspaceInvitation } from 'src/modules-api/workspace/schemas/workspace-invitation.schema';
import { OnEvent } from '@nestjs/event-emitter';
import { Role } from 'src/modules-api/workspace/schemas/roles.schema';
import { APP_URL } from 'src/common/constants/app.constant';
import { sendWorkspaceInvitationEmail } from 'src/common/verify-email/send-workspace-invitation-email';
import { InviteMemberDto } from './dto/invite-memer.dto';
import { User, UserDocument } from '../auth/schemas/user.schema';

@Injectable()
export class WorkspaceService {
  constructor(
    @InjectModel(Workspace.name) private readonly workspaceModel: Model<Workspace>,
    @InjectModel(WorkspaceMember.name) private readonly workspaceMemberModel: Model<WorkspaceMember>,
    @InjectModel(WorkspaceInvitation.name) private invitationModel: Model<WorkspaceInvitation>,
    @InjectModel(User.name) private readonly userModel: Model<User>, 
    @InjectModel(Role.name) private readonly roleModel: Model<Role>,
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
      roleId: ROLE_IDS.ADMIN_WORKSPACE,
      workspaceName: newWorkspace.name,
      workspaceDescription: newWorkspace.description
    });

    return true;
  }

  async findAll(user: UserDocument) {
    const members = await this.workspaceMemberModel
      .find({
        userId: user._id,
        isDeleted: { $ne: true }
      })
      .populate('roleId', 'name')
      // lấy memberCount và created_at
      .populate({
        path: 'workspaceId',
        select: 'memberCount created_at isDeleted',
        match: { isDeleted: { $ne: true } } 
      })
      .sort({ joinedAt: -1 })
      .exec();

    return members
      // Lọc bỏ trường hợp rác: member còn nhưng workspace đã bị xóa (match ở trên sẽ trả về null)
      .filter((member) => member.workspaceId !== null) 
      .map((member: any) => ({
        _id: member.workspaceId._id,
        workspaceName: member.workspaceName,
        workspaceDescription: member.workspaceDescription,
        createdAt: member.workspaceId.created_at,
        userRole: member.roleId?.name,
        memberCount: member.workspaceId.memberCount,
        joinedAt: member.joinedAt
      }));
  }

  async update(id: string, updateWorkspaceDto: UpdateWorkspaceDto) {
    const { name, description } = updateWorkspaceDto;
    
    // Tự động cập nhật updatedAt
    const updatedWorkspace = await this.workspaceModel.findByIdAndUpdate(
      id,
      { name, description },
      { new: true } // trả về workspace mới
    ).exec();

    if (updatedWorkspace) {
        await this.workspaceMemberModel.updateMany(
            { workspaceId: id },
            { 
                $set: { 
                    workspaceName: name, 
                    workspaceDescription: description 
                } 
            }
        ).exec();
    }

    if (!updatedWorkspace || updatedWorkspace.isDeleted) {
      throw new NotFoundException('Workspace không tồn tại hoặc đã bị xóa');
    }

    return updatedWorkspace;
  }

  async remove(id: string, user: UserDocument) {
    // Xóa mềm Workspace
    const deletedWorkspace = await this.workspaceModel.findByIdAndUpdate(
      id,
      {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: user._id,
      },
      { new: true }
    ).exec();

    if (!deletedWorkspace) {
      throw new NotFoundException('Workspace không tồn tại');
    }

    // Xóa mềm toàn bộ quan hệ Member-Workspace
    await this.workspaceMemberModel.updateMany(
      {
        workspaceId: new Types.ObjectId(id),
      },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: user._id 
        }
      }
    ).exec();

    return { message: 'Xóa workspace thành công' };
  }

  // Lắng nghe sự kiện 'user.email.verified'
  @OnEvent('user.email.verified')
  async handlePendingInvitationsAfterVerified(payload: { email: string, userId: string }) {
    const { email, userId } = payload;
    
    // Tìm toàn bộ lời mời PENDING của email này
    const pendingInvites = await this.invitationModel.find({
      email: email.toLowerCase(),
      status: InvitationStatus.PENDING,
      expiresAt: { $gt: new Date() }
    }).exec();

    if (pendingInvites.length === 0) return;

    // Duyệt qua từng lời mời để add vào workspace_members
    for (const invite of pendingInvites) {
      const isMemberExist = await this.workspaceMemberModel.exists({
        workspaceId: new Types.ObjectId(invite.workspaceId),
        userId: new Types.ObjectId(userId)
      });

      if (!isMemberExist) {
        // Thêm user vào workspace
        await this.workspaceMemberModel.create({
          workspaceId: new Types.ObjectId(invite.workspaceId),
          userId: new Types.ObjectId(userId),
          roleId: new Types.ObjectId(invite.roleId),
          joinedAt: new Date()
        });
        
        // Tăng memberCount
        await this.workspaceModel.findByIdAndUpdate(invite.workspaceId, {
          $inc: { memberCount: 1 }
        });
      }

      // Cập nhật trạng thái
      invite.status = InvitationStatus.ACCEPTED;
      await invite.save();
    }
  }

  async inviteMember(workspaceId: string, payload: InviteMemberDto, inviter: UserDocument) {
    const { email, roleId } = payload;
    const emailLower = email.toLowerCase();

    // Lấy thông tin Workspace và Role để gửi mail
    const workspace = await this.workspaceModel.findOne({ 
      _id: workspaceId, 
      isDeleted: { $ne: true } 
    }).exec();
    
    if (!workspace) throw new NotFoundException('Workspace không tồn tại hoặc đã bị xóa');

    const role = await this.roleModel.findById(roleId).exec();
    if (!role) throw new BadRequestException('Role không tồn tại');

    // Tìm xem email này đã đăng ký chưa
    const userExist = await this.userModel.findOne({ email: emailLower }).exec();

    // USER ĐÃ TỒN TẠI VÀ ĐÃ VERIFY EMAIL
    if (userExist && userExist.isEmailVerified) {
      // Kiểm tra xem đã là thành viên chưa
      const isMember = await this.workspaceMemberModel.exists({
        workspaceId,
        userId: userExist._id,
        isDeleted: { $ne: true }
      });

      if (isMember) {
        throw new BadRequestException('Người dùng đã là thành viên của Workspace này');
      }

      // Add thẳng vào workspace_members
      await this.workspaceMemberModel.create({
        workspaceId: new Types.ObjectId(workspaceId),
        userId: userExist._id,
        roleId,
        joinedAt: new Date()
      });

      // Tăng số lượng member
      await this.workspaceModel.findByIdAndUpdate(workspaceId, { $inc: { memberCount: 1 } });

      // Gửi mail truy cập thẳng workspace
      await sendWorkspaceInvitationEmail({
        to: emailLower,
        workspaceName: workspace.name,
        inviterName: inviter.fullName,
        roleName: role.name,
        actionUrl: `${APP_URL}/workspaces/${workspaceId}` // Đi thẳng tới workspace
      });

      return { message: 'Đã thêm thành viên trực tiếp vào Workspace và gửi email thông báo' };
    }

    // USER CHƯA TỒN TẠI HOẶC CHƯA VERIFY EMAIL
    // Kiểm tra xem có lời mời nào đang Pending mà chưa hết hạn không
    const pendingInvite = await this.invitationModel.exists({
      email: emailLower,
      workspaceId,
      status: InvitationStatus.PENDING,
      expiresAt: { $gt: new Date() }
    });

    if (pendingInvite) {
      throw new BadRequestException('Lời mời đã được gửi trước đó và đang chờ xác nhận');
    }

    // Tạo record trong WorkspaceInvitation
    await this.invitationModel.create({
      email: emailLower,
      workspaceId,
      roleId,
      inviterId: inviter._id
    });

    // Gửi mail kèm link tới trang đăng ký
    await sendWorkspaceInvitationEmail({
      to: emailLower,
      workspaceName: workspace.name,
      inviterName: inviter.fullName,
      roleName: role.name,
      actionUrl: `${APP_URL}/register?email=${encodeURIComponent(emailLower)}` // Chuyển hướng sang Sign Up
    });

    return { message: 'Đã gửi lời mời tham gia qua email cho tài khoản chưa xác thực' };
  }
}
