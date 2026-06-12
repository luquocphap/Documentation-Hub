import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Workspace } from 'src/modules-api/workspace/schemas/workspaces.schema';
import { Model, Types } from 'mongoose';
import { WorkspaceMember } from 'src/modules-api/workspace/schemas/workspace_members.schema';
import { ROLE_IDS } from 'src/common/seeds/role.seed';
import { InvitationStatus, WorkspaceInvitation } from 'src/modules-api/workspace/schemas/workspace-invitation.schema';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { WorkspaceRole } from 'src/modules-api/workspace/schemas/workspace-roles.schema';
import { APP_URL } from 'src/common/constants/app.constant';
import { sendWorkspaceInvitationEmail } from 'src/common/email/send-workspace-invitation-email';
import { User, UserDocument } from '../auth/schemas/user.schema';
import { DocumentModel } from '../document/schemas/documents.schema';
import { ChangeRoleDto } from './dto/change-role.dto';
import { InviteMemberDto } from './dto/invite-memer.dto';

@Injectable()
export class WorkspaceService {
  constructor(
    @InjectModel(Workspace.name) private readonly workspaceModel: Model<Workspace>,
    @InjectModel(WorkspaceMember.name) private readonly workspaceMemberModel: Model<WorkspaceMember>,
    @InjectModel(WorkspaceInvitation.name) private invitationModel: Model<WorkspaceInvitation>,
    @InjectModel(User.name) private readonly userModel: Model<User>, 
    @InjectModel(WorkspaceRole.name) private readonly roleModel: Model<WorkspaceRole>,
    @InjectModel(DocumentModel.name) private readonly documentModel: Model<DocumentModel>,
    private eventEmitter: EventEmitter2
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

    this.eventEmitter.emit('workspace.member.added', { 
      workspaceId: newWorkspace._id.toString(), 
      userId: user._id.toString() 
    });

    return {
      _id: newWorkspace._id
    };
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

  async findOne(id: string, user: UserDocument) {
    const workspaceId = new Types.ObjectId(id);

    const [workspace, documents, currentMember] = await Promise.all([
      this.workspaceModel.findOne({ 
        _id: workspaceId, 
        isDeleted: { $ne: true } 
      }).exec(),
      this.documentModel.find({
        workspaceId: workspaceId,
        isDeleted: { $ne: true }
      })
      .sort({ created_at: -1 })
      .exec(),
      this.workspaceMemberModel.findOne({
        workspaceId: workspaceId,
        userId: user._id,
        isDeleted: { $ne: true }
      })
      .populate('roleId', 'name')
      .exec()
    ]);

    if (!workspace) {
      throw new NotFoundException('Workspace không tồn tại hoặc đã bị xóa');
    }

    if (!currentMember) {
      throw new ForbiddenException('Bạn không phải là thành viên của Workspace này');
    }

    return {
      _id: workspace._id,
      name: workspace.name,
      description: workspace.description,
      memberCount: workspace.memberCount,
      created_at: (workspace as any).created_at, 
      userRole: (currentMember.roleId as any)?.name,
      documents: documents
    };
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
      const workspace = await this.workspaceModel.findById(invite.workspaceId);
      const isMemberExist = await this.workspaceMemberModel.exists({
        workspaceId: new Types.ObjectId(invite.workspaceId),
        userId: new Types.ObjectId(userId)
      });

      if (!isMemberExist) {
        // Thêm user vào workspace
        await this.workspaceMemberModel.create({
          workspaceId: new Types.ObjectId(invite.workspaceId),
          workspaceName: workspace?.name,
          workspaceDescription: workspace?.description,
          userId: new Types.ObjectId(userId),
          roleId: new Types.ObjectId(invite.roleId),
          joinedAt: new Date()
        });
        
        // Tăng memberCount
        await this.workspaceModel.findByIdAndUpdate(invite.workspaceId, {
          $inc: { memberCount: 1 }
        });

        this.eventEmitter.emit('workspace.member.added', { 
          workspaceId: invite.workspaceId.toString(), 
          userId: userId 
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
      await this.workspaceMemberModel.findOneAndUpdate(
        {
          workspaceId: new Types.ObjectId(workspaceId),
          userId: new Types.ObjectId(userExist._id)
        },
        {
          $set: {
            roleId: new Types.ObjectId(roleId),
            joinedAt: new Date(),
            isDeleted: false,
            deletedAt: null,
            deletedBy: null,
            workspaceName: workspace.name,
            workspaceDescription: workspace.description
          }
        },
        { 
          upsert: true,
          returnDocument: 'after'
        }
      ).exec();

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

      this.eventEmitter.emit('workspace.member.added', { 
        workspaceId: workspaceId, 
        userId: userExist._id.toString() 
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

  async getWorkspaceRoles() {
    const roles = await this.roleModel
    .find()
    .select('-permissions')
    .lean()
    .exec();

    return roles;
  }

  async getMembers(workspaceId: string) {
    const members = await this.workspaceMemberModel
      .find({
        workspaceId: new Types.ObjectId(workspaceId),
        isDeleted: { $ne: true },
      })
      .populate('userId', 'fullName email')
      .populate('roleId', 'name')
      .sort({ joinedAt: 1 })
      .exec();

    return members.map((m: any) => ({
      userId: m.userId._id,
      fullName: m.userId?.fullName,
      email: m.userId?.email,
      role: m.roleId?.name,
      roleId: m.roleId?._id,
      joinedAt: m.joinedAt,
    }));
  }

  async changeMemberRole(workspaceId: string, payload: ChangeRoleDto) {
    const { userId, roleId } = payload;

    // Kiểm tra xem Role mới truyền lên có hợp lệ trong hệ thống không
    const roleExist = await this.roleModel.findById(roleId).exec();
    if (!roleExist) {
      throw new BadRequestException('Role does not exist');
    }

    // Tìm và cập nhật role mới cho member trong đúng workspaceId
    const updatedMember = await this.workspaceMemberModel.findOneAndUpdate(
      {
        workspaceId: new Types.ObjectId(workspaceId),
        userId: new Types.ObjectId(userId),
        isDeleted: { $ne: true },
      },
      { 
        $set: { roleId: new Types.ObjectId(roleId) } 
      },
      { returnDocument: 'after' }
    ).exec();

    if (!updatedMember) {
      throw new NotFoundException('Không tìm thấy thành viên này trong Workspace hoặc thành viên đã bị xóa');
    }

    return { message: 'Cập nhật vai trò thành viên thành công' };
  }

  async removeMember(workspaceId: string, userId: string, currentUser: UserDocument) {

    // Kiểm tra xem thành viên này có thực sự đang ở trong Workspace không
    const targetMember = await this.workspaceMemberModel.findOne({
      workspaceId: new Types.ObjectId(workspaceId),
      userId: new Types.ObjectId(userId),
      isDeleted: { $ne: true },
    }).exec();

    if (!targetMember) {
      throw new NotFoundException('Không tìm thấy thành viên này hoặc họ đã bị xóa khỏi Workspace');
    }

    if (userId === currentUser._id.toString()) {
      throw new BadRequestException("Không thể xóa chính mình")
    }

    // Lấy danh sách các Admin CÒN HOẠT ĐỘNG trong Workspace
    const adminMembers = await this.workspaceMemberModel.find({
      workspaceId: new Types.ObjectId(workspaceId),
      roleId: ROLE_IDS.ADMIN_WORKSPACE,
      isDeleted: { $ne: true } // Bắt buộc: Loại bỏ các record đã xóa mềm
    }).exec();

    const isTargetUserAdmin = adminMembers.some(
      (m) => m.userId.toString() === userId.toString()
    );

    // Nếu chỉ còn 1 Admin (hoặc ít hơn) VÀ người đang bị thao tác chính là Admin đó -> Chặn lại
    if (adminMembers.length <= 1 && isTargetUserAdmin) {
      throw new BadRequestException("Không thể thực hiện vì đây là Admin duy nhất còn lại của Workspace");
    }

    // Thực hiện xóa mềm trong bảng workspace_members
    const deletedMember = await this.workspaceMemberModel.findOneAndUpdate(
      { _id: targetMember._id },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: currentUser._id,
        },
      },
      { returnDocument: 'after' }
    ).exec();

    // Đồng bộ lại dữ liệu: Giảm memberCount trong bảng workspaces đi 1
    if (deletedMember) {
      await this.workspaceModel.findByIdAndUpdate(
        workspaceId,
        { $inc: { memberCount: -1 } },
        { returnDocument: 'after' }
      ).exec();
    }

    return { message: 'Đã xóa thành viên khỏi Workspace thành công' };
  }
}
