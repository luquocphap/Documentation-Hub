import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { InjectModel } from '@nestjs/mongoose';
import { DocumentModel } from './schemas/documents.schema';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../auth/schemas/user.schema';
import { CloudinaryService } from 'src/modules-system/cloudinary/cloudinary.service';
import { DocumentMember } from './schemas/document-members.schema';
import { DOCUMENT_ROLE_IDS } from 'src/common/seeds/document-role.seed';
import MarkdownIt from 'markdown-it';
import { PdfService } from 'src/modules-system/pdf/pdf.service';
import { CreateDocumentMarkdownDto } from './dto/create-document-markdown.dto';
import { generateHtmlDocument } from 'src/common/helpers/generate-html-document.helper';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { WorkspaceMember } from '../workspace/schemas/workspace_members.schema';
import { DocumentRole } from './schemas/document-roles.schema';
import {
  DocumentInvitation,
  InvitationStatus,
} from './schemas/document-invitation.schemas';
import { APP_URL } from 'src/common/constants/app.constant';
import { InviteDocumentMemberDto } from './dto/invite-document-member.dto';
import { sendDocumentInvitationEmail } from 'src/common/email/send-document-invitation-email';
import { ChangeDocumentRoleDto } from './dto/change-document-role.dto';
import { WorkspaceRole } from '../workspace/schemas/workspace-roles.schema';
import { DocumentContentExtractorService } from 'src/modules-system/document-parser/document-content-extractor.service';
import {
  ACTIVITY_LOG_EVENT,
  ActivityLogAction,
  type ActivityLogPayload,
} from 'src/common/events/activity-log.event';
import { RedisService } from 'src/modules-system/redis/redis.service';
import { ROLE_IDS } from 'src/common/seeds/role.seed';

const DOCUMENT_CONTENT_EVENTS = {
  EXTRACT_PDF: 'document.content.extract.pdf',
  EXTRACT_MARKDOWN: 'document.content.extract.markdown',
} as const;

type ExtractPdfContentPayload = {
  documentId: string;
  publicId: string;
  fileUrl?: string;
};

type ExtractMarkdownContentPayload = {
  documentId: string;
  markdownContent: string;
};

@Injectable()
export class DocumentService {
  constructor(
    @InjectModel(DocumentModel.name)
    private readonly documentModel: Model<DocumentModel>,
    @InjectModel(DocumentMember.name)
    private readonly documentMemberModel: Model<DocumentMember>,
    @InjectModel(WorkspaceMember.name)
    private readonly workspaceMemberModel: Model<WorkspaceMember>,
    @InjectModel(DocumentRole.name)
    private readonly documentRoleModel: Model<DocumentRole>,
    @InjectModel(DocumentInvitation.name)
    private invitationModel: Model<DocumentInvitation>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly cloudinaryService: CloudinaryService,
    private readonly pdfService: PdfService,
    private readonly documentContentExtractorService: DocumentContentExtractorService,
    private eventEmitter: EventEmitter2,
    private readonly redisService: RedisService,
  ) {}

  private emitDocumentContentEvent(
    eventName: (typeof DOCUMENT_CONTENT_EVENTS)[keyof typeof DOCUMENT_CONTENT_EVENTS],
    payload: ExtractPdfContentPayload | ExtractMarkdownContentPayload,
  ) {
    void this.eventEmitter
      .emitAsync(eventName, payload)
      .catch((error) =>
        console.error(`[DocumentContent] Event failed: ${eventName}`, error),
      );
  }

  private emitActivityLogEvent(payload: ActivityLogPayload) {
    void this.eventEmitter
      .emitAsync(ACTIVITY_LOG_EVENT, payload)
      .catch((error) =>
        console.error('[ActivityLog] Document event failed', error),
      );
  }

  private async saveExtractedContent(documentId: string, content: string) {
    await this.documentModel
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(documentId),
          isDeleted: { $ne: true },
        },
        {
          $set: { content },
        },
      )
      .exec();
  }

  async getRoles() {
    const roles = await this.documentRoleModel
      .find()
      .select('-permissions')
      .lean()
      .exec();

    return roles;
  }

  private async generateUniqueTitle(
    workspaceId: Types.ObjectId,
    baseTitle: string,
  ): Promise<string> {
    // Escape các ký tự đặc biệt của regex trong baseTitle
    const escapedTitle = baseTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Tìm các file có tên chính xác hoặc có dạng "Tên (1)", "Tên (2)"
    const regex = new RegExp(`^${escapedTitle}( \\(\\d+\\))?$`, 'i');

    const existingDocs = await this.documentModel
      .find({
        workspaceId,
        title: { $regex: regex },
        isDeleted: { $ne: true },
      })
      .exec();

    if (existingDocs.length === 0) return baseTitle;

    const existingTitles = existingDocs.map((doc) => doc.title);
    let counter = 1;
    let newTitle = baseTitle;

    // Tăng số thứ tự cho đến khi tên không còn trùng
    while (existingTitles.includes(newTitle)) {
      newTitle = `${baseTitle} (${counter})`;
      counter++;
    }

    return newTitle;
  }

  async findAll(workspaceId: string) {
    if (!workspaceId)
      throw new BadRequestException('Vui lòng cung cấp workspaceId');

    const documents = await this.documentModel
      .find({
        workspaceId: new Types.ObjectId(workspaceId),
        isDeleted: { $ne: true },
      })
      .populate('createdBy', 'fullName _id')
      .sort({ updated_at: -1 }) // Mới nhất lên trước
      .exec();

    return documents.map((doc: any) => ({
      id: doc._id,
      title: doc.title,
      ownerName: doc.createdBy?.fullName || 'Unknown',
      ownerId: doc.createdBy?._id || 'Unknown',
      updatedAt: doc.updated_at,
    }));
  }

  async create(createDocumentDto: CreateDocumentDto, user: UserDocument) {
    const workspaceId = new Types.ObjectId(createDocumentDto.workspaceId);

    // Xử lý chống trùng tên
    const uniqueTitle = await this.generateUniqueTitle(
      workspaceId,
      createDocumentDto.title,
    );

    const newDocument = await this.documentModel.create({
      workspaceId,
      title: uniqueTitle,
      public_id: '', // Sẽ được cập nhật khi user thực sự gọi upload file
      content: '',
      createdBy: user._id,
    });

    await this.documentMemberModel.create({
      documentId: newDocument._id,
      userId: user._id,
      roleId: DOCUMENT_ROLE_IDS.OWNER,
      joinedAt: new Date(),
    });

    // Cấp quyền editor cho toàn bộ workspace members
    this.eventEmitter.emit('document.created', {
      documentId: newDocument._id.toString(),
      workspaceId: workspaceId.toString(),
      ownerId: user._id.toString(),
    });

    this.emitActivityLogEvent({
      action: ActivityLogAction.CREATE_DOCUMENT,
      actorId: user._id.toString(),
      workspaceId: workspaceId.toString(),
      documentId: newDocument._id.toString(),
      documentName: newDocument.title,
    });

    return newDocument;
  }

  async getUploadSignature(documentId: string, user: UserDocument) {
    // Check xem document tồn tại và user có quyền không (Guard đã check, nhưng check lại DB cho chắc)
    const document = await this.documentModel.findOne({
      _id: new Types.ObjectId(documentId),
      isDeleted: { $ne: true },
    });

    if (!document) {
      throw new NotFoundException('Tài liệu không tồn tại hoặc đã bị xóa');
    }

    // Lấy thông số từ Cloudinary Service
    const signatureData = this.cloudinaryService.generatePresignedSignature(
      documentId,
      user._id.toString(),
    );

    return signatureData;
  }

  //  Xử lý Webhook từ Cloudinary trả về
  async handleCloudinaryWebhook(body: any) {
    // Chỉ quan tâm đến event 'upload' thành công
    if (body.notification_type !== 'upload') {
      return { message: 'Ignored non-upload event' };
    }

    // Lấy dữ liệu context mà ta đã nhúng vào lúc sinh chữ ký
    const documentId = body.context?.custom?.documentId;
    const userId = body.context?.custom?.userId;
    const public_id = body.public_id;

    if (documentId && userId && public_id) {
      const document = await this.documentModel.findOne({
        _id: new Types.ObjectId(documentId),
        isDeleted: { $ne: true },
      });

      if (document) {
        const isUpdatingExistingFile = Boolean(document.public_id?.trim());

        // existing file -> update
        if (isUpdatingExistingFile) {
          await this.cloudinaryService
            .deleteFile(document.public_id)
            .catch((error) => console.error('Lỗi xóa file cũ:', error));
        }

        document.public_id = public_id;
        document.updatedAt = new Date();
        document.updatedBy = new Types.ObjectId(userId);
        await document.save();

        // log update activity
        if (isUpdatingExistingFile) {
          this.emitActivityLogEvent({
            action: ActivityLogAction.UPDATE_DOCUMENT,
            actorId: userId,
            workspaceId: document.workspaceId.toString(),
            documentId,
            documentName: document.title,
          });
        }

        // emit event to upsert content in db
        this.emitDocumentContentEvent(DOCUMENT_CONTENT_EVENTS.EXTRACT_PDF, {
          documentId,
          publicId: public_id,
          fileUrl: body.secure_url ?? body.url,
        });
      }
    }

    return { message: 'Webhook processed successfully' };
  }

  async update(
    documentId: string,
    updateDocumentDto: UpdateDocumentDto,
    user: UserDocument,
  ) {
    const document = await this.documentModel.findOne({
      _id: new Types.ObjectId(documentId),
      isDeleted: { $ne: true },
    });

    if (!document) {
      throw new NotFoundException('Tài liệu không tồn tại hoặc đã bị xóa');
    }

    // Nếu đổi sang tên mới, lại kiểm tra trùng tên
    if (updateDocumentDto.title && updateDocumentDto.title !== document.title) {
      const uniqueTitle = await this.generateUniqueTitle(
        document.workspaceId,
        updateDocumentDto.title,
      );
      document.title = uniqueTitle;
    }

    document.updatedBy = user._id as Types.ObjectId;
    await document.save();

    this.emitActivityLogEvent({
      action: ActivityLogAction.UPDATE_DOCUMENT,
      actorId: user._id.toString(),
      workspaceId: document.workspaceId.toString(),
      documentId,
      documentName: document.title,
    });

    return document;
  }

  async remove(documentId: string, user: UserDocument) {
    const document = await this.documentModel
      .findByIdAndUpdate(
        documentId,
        {
          isDeleted: true,
          deletedAt: new Date(),
          deletedBy: user._id,
        },
        { new: true },
      )
      .exec();

    if (!document) {
      throw new NotFoundException('Tài liệu không tồn tại');
    }

    this.emitActivityLogEvent({
      action: ActivityLogAction.DELETE_DOCUMENT,
      actorId: user._id.toString(),
      workspaceId: document.workspaceId.toString(),
      documentId,
      documentName: document.title,
    });

    return { message: 'Xóa tài liệu thành công' };
  }

  async getMyRole(documentId: string, user: UserDocument) {
    // Tìm kiếm record thành viên của user trong document này
    const member = await this.documentMemberModel
      .findOne({
        documentId: new Types.ObjectId(documentId),
        userId: user._id,
        isDeleted: { $ne: true },
      })
      .populate('roleId', 'name')
      .exec();

    if (!member) {
      throw new ForbiddenException(
        'Bạn không có quyền truy cập tài liệu này hoặc tài liệu không tồn tại',
      );
    }

    return {
      role: (member.roleId as any)?.name || 'Unknown',
    };
  }

  async createFromMarkdown(dto: CreateDocumentMarkdownDto, user: UserDocument) {
    const { workspaceId, title, markdownContent } = dto;
    const workspaceObjId = new Types.ObjectId(workspaceId);

    // Kiểm tra chống trùng tên
    const uniqueTitle = await this.generateUniqueTitle(workspaceObjId, title);

    // Parse Markdown sang HTML và bọc CSS
    const md = new MarkdownIt({ html: true, breaks: true, linkify: true });
    const rawHtml = md.render(markdownContent);
    const fullHtml = generateHtmlDocument(rawHtml);

    // Gọi PDF Service để lấy Buffer
    const pdfBuffer = await this.pdfService.generatePdfFromHtml(fullHtml);

    // Giả lập Multer File
    const mockFile = {
      fieldname: 'file',
      originalname: `${uniqueTitle}.pdf`,
      encoding: '7bit',
      mimetype: 'application/pdf',
      buffer: pdfBuffer,
      size: pdfBuffer.length,
    } as Express.Multer.File;

    // Upload lên Cloudinary
    const uploadResult = await this.cloudinaryService.uploadFile(mockFile);
    if (!uploadResult || !uploadResult.public_id) {
      throw new BadRequestException(
        'Lỗi trong quá trình upload PDF lên đám mây',
      );
    }

    // Lưu Database
    const newDocument = await this.documentModel.create({
      workspaceId: workspaceObjId,
      title: uniqueTitle,
      public_id: uploadResult.public_id,
      content: '',
      createdBy: user._id,
    });

    // Cấp quyền OWNER
    await this.documentMemberModel.create({
      documentId: newDocument._id,
      userId: user._id,
      roleId: DOCUMENT_ROLE_IDS.OWNER,
      joinedAt: new Date(),
    });

    this.emitDocumentContentEvent(DOCUMENT_CONTENT_EVENTS.EXTRACT_MARKDOWN, {
      documentId: newDocument._id.toString(),
      markdownContent,
    });

    this.emitActivityLogEvent({
      action: ActivityLogAction.CREATE_DOCUMENT,
      actorId: user._id.toString(),
      workspaceId: workspaceObjId.toString(),
      documentId: newDocument._id.toString(),
      documentName: newDocument.title,
    });

    return newDocument;
  }

  async findOne(documentId: string) {
    const cachedDocument = await this.redisService.getClient().get(`document:${documentId}`);
    if (cachedDocument) {
      return JSON.parse(cachedDocument);
    }

    const document = await this.documentModel
      .findOne({
        _id: new Types.ObjectId(documentId),
        isDeleted: { $ne: true },
      })
      .exec();

    if (!document) {
      throw new NotFoundException('Tài liệu không tồn tại hoặc đã bị xóa');
    }

    const documentRes = {
      _id: document._id,
      workspaceId: document.workspaceId,
      title: document.title,
      public_id: document.public_id,
      createdAt: (document as any).created_at,
      updatedAt: (document as any).updated_at,
    }

    await this.redisService.getClient().set(
      `document:${documentId}`,
       JSON.stringify(documentRes),
       'EX',
        2
      )

    return documentRes;
  }

  async inviteMember(
    documentId: string,
    payload: InviteDocumentMemberDto,
    inviter: UserDocument,
  ) {
    const { email, roleId } = payload;
    const emailLower = email.toLowerCase();

    const document = await this.documentModel
      .findOne({ _id: documentId, isDeleted: { $ne: true } })
      .exec();
    if (!document)
      throw new NotFoundException('Tài liệu không tồn tại hoặc đã bị xóa');

    const role = await this.documentRoleModel.findById(roleId).exec();
    if (!role) throw new BadRequestException('Role không tồn tại');

    const userExist = await this.userModel
      .findOne({ email: emailLower })
      .exec();

    // TRƯỜNG HỢP 1: USER ĐÃ TỒN TẠI VÀ ĐÃ VERIFY
    if (userExist && userExist.isEmailVerified) {
      const isMember = await this.documentMemberModel.exists({
        documentId,
        userId: userExist._id,
        isDeleted: { $ne: true },
      });

      if (isMember)
        throw new BadRequestException(
          'Người dùng đã có quyền truy cập tài liệu này',
        );

      // Thêm vào document_members
      await this.documentMemberModel
        .findOneAndUpdate(
          {
            documentId: new Types.ObjectId(documentId),
            userId: new Types.ObjectId(userExist._id),
          },
          {
            $set: {
              roleId: new Types.ObjectId(roleId),
              joinedAt: new Date(),
              isDeleted: false,
            },
          },
          { upsert: true, returnDocument: 'after' },
        )
        .exec();

      // Gửi mail truy cập thẳng tài liệu
      await sendDocumentInvitationEmail({
        to: emailLower,
        documentName: document.title,
        inviterName: inviter.fullName,
        roleName: role.name,
        actionUrl: `${APP_URL}/document/${documentId}`, // Link vào tài liệu
      });

      this.emitActivityLogEvent({
        action: ActivityLogAction.SHARE_DOCUMENT,
        actorId: inviter._id.toString(),
        workspaceId: document.workspaceId.toString(),
        documentId,
        documentName: document.title,
        email: emailLower,
        targetUserId: userExist._id.toString(),
      });

      return {
        message:
          'Đã thêm thành viên trực tiếp vào Tài liệu và gửi email thông báo',
      };
    }

    // TRƯỜNG HỢP 2: USER CHƯA TỒN TẠI HOẶC CHƯA VERIFY
    const pendingInvite = await this.invitationModel.exists({
      email: emailLower,
      documentId,
      status: InvitationStatus.PENDING,
      expiresAt: { $gt: new Date() },
    });

    if (pendingInvite)
      throw new BadRequestException(
        'Lời mời đã được gửi trước đó và đang chờ xác nhận',
      );

    // Lưu lời mời
    await this.invitationModel.create({
      email: emailLower,
      documentId,
      roleId,
      inviterId: inviter._id,
    });

    // Gửi mail mời đăng ký
    await sendDocumentInvitationEmail({
      to: emailLower,
      documentName: document.title,
      inviterName: inviter.fullName,
      roleName: role.name,
      actionUrl: `${APP_URL}/document/${documentId}`,
    });

    this.emitActivityLogEvent({
      action: ActivityLogAction.SHARE_DOCUMENT,
      actorId: inviter._id.toString(),
      workspaceId: document.workspaceId.toString(),
      documentId,
      documentName: document.title,
      email: emailLower,
      targetUserId: userExist?._id.toString(),
    });

    return {
      message: 'Đã gửi lời mời tham gia qua email cho tài khoản chưa xác thực',
    };
  }

  // LẮNG NGHE EVENT KHI USER VERIFY EMAIL
  @OnEvent('user.email.verified')
  async handlePendingDocumentInvitationsAfterVerified(payload: {
    email: string;
    userId: string;
  }) {
    const { email, userId } = payload;

    const pendingInvites = await this.invitationModel
      .find({
        email: email.toLowerCase(),
        status: InvitationStatus.PENDING,
        expiresAt: { $gt: new Date() },
      })
      .exec();

    if (pendingInvites.length === 0) return;

    for (const invite of pendingInvites) {
      const isMemberExist = await this.documentMemberModel.exists({
        documentId: new Types.ObjectId(invite.documentId),
        userId: new Types.ObjectId(userId),
      });

      if (!isMemberExist) {
        await this.documentMemberModel.create({
          documentId: new Types.ObjectId(invite.documentId),
          userId: new Types.ObjectId(userId),
          roleId: new Types.ObjectId(invite.roleId),
          joinedAt: new Date(),
        });
      }

      invite.status = InvitationStatus.ACCEPTED;
      await invite.save();
    }
  }

  async getExternalMembers(documentId: string) {
    // Kiểm tra tài liệu tồn tại
    const document = await this.documentModel
      .findOne({
        _id: new Types.ObjectId(documentId),
        isDeleted: { $ne: true },
      })
      .exec();

    if (!document) {
      throw new NotFoundException('Tài liệu không tồn tại hoặc đã bị xóa');
    }

    // Lấy danh sách toàn bộ userId thuộc Workspace chứa tài liệu này
    const workspaceMembers = await this.workspaceMemberModel
      .find({
        workspaceId: document.workspaceId,
        isDeleted: { $ne: true },
      })
      .select('userId')
      .lean()
      .exec();

    const workspaceUserIds = new Set(
      workspaceMembers.map((m) => m.userId.toString()),
    );

    // Lấy toàn bộ thành viên của Document và populate thông tin cần thiết
    const documentMembers = await this.documentMemberModel
      .find({
        documentId: document._id,
        isDeleted: { $ne: true },
      })
      .populate('userId', 'fullName email')
      .populate('roleId', 'name')
      .lean()
      .exec();

    // Lọc ra những thành viên document KHÔNG nằm trong Workspace
    const externalMembers = documentMembers.filter((m) => {
      if (!m.userId) return false;
      const userIdStr = m.userId._id?.toString();
      return !workspaceUserIds.has(userIdStr);
    });

    // Map dữ liệu trả về theo đúng cấu trúc yêu cầu
    return externalMembers.map((m: any) => ({
      userId: m.userId?._id,
      fullName: m.userId?.fullName,
      email: m.userId?.email,
      roleId: m.roleId?._id,
      roleName: m.roleId?.name,
    }));
  }

  async removeExternalMember(
    documentId: string,
    userId: string,
    currentUser: UserDocument,
  ) {
    const document = await this.documentModel
      .findOne({
        _id: new Types.ObjectId(documentId),
        isDeleted: { $ne: true },
      })
      .exec();

    if (!document) {
      throw new NotFoundException('Tài liệu không tồn tại hoặc đã bị xóa');
    }

    const targetMember = await this.documentMemberModel
      .findOne({
        documentId: document._id,
        userId: new Types.ObjectId(userId),
        isDeleted: { $ne: true },
      })
      .exec();

    const workspaceMember = await this.workspaceMemberModel.exists({
      workspaceId: document.workspaceId,
      userId: new Types.ObjectId(userId),
      isDeleted: { $ne: true },
    });

    if (!targetMember || workspaceMember) {
      throw new ForbiddenException(
        'Người dùng này không phải external member của tài liệu',
      );
    }

    const targetUser = await this.userModel
      .findById(userId)
      .select('email')
      .lean()
      .exec();

    await this.documentMemberModel
      .findByIdAndUpdate(targetMember._id, {
        $set: { isDeleted: true },
      })
      .exec();

    this.emitActivityLogEvent({
      action: ActivityLogAction.REVOKE_ACCESS,
      actorId: currentUser._id.toString(),
      workspaceId: document.workspaceId.toString(),
      documentId,
      documentName: document.title,
      email: (targetUser as any)?.email ?? userId,
      targetUserId: userId,
    });

    return { message: 'Đã xóa external member khỏi tài liệu thành công' };
  }

  async changeMemberRole(documentId: string, payload: ChangeDocumentRoleDto) {
    const { userId, roleId } = payload;

    // Kiểm tra xem Document Role truyền lên có tồn tại hay không
    const roleExist = await this.documentRoleModel.findById(roleId).exec();
    if (!roleExist) {
      throw new BadRequestException('Vai trò tài liệu không tồn tại');
    }

    // Cập nhật trường roleId mới cho thành viên thuộc documentId và userId tương ứng
    const updatedMember = await this.documentMemberModel
      .findOneAndUpdate(
        {
          documentId: new Types.ObjectId(documentId),
          userId: new Types.ObjectId(userId),
          isDeleted: { $ne: true },
        },
        {
          $set: { roleId: new Types.ObjectId(roleId) },
        },
        { returnDocument: 'after' },
      )
      .exec();

    if (!updatedMember) {
      throw new NotFoundException(
        'Không tìm thấy thành viên này trong tài liệu hoặc quyền truy cập đã bị hủy',
      );
    }

    return {
      message: 'Cập nhật vai trò thành viên đối với tài liệu thành công',
    };
  }


  // extract pdf content -> db
  @OnEvent(DOCUMENT_CONTENT_EVENTS.EXTRACT_PDF, { async: true })
  async handleExtractPdfContent(payload: ExtractPdfContentPayload) {
    try {
      const pdfBuffer = await this.cloudinaryService.downloadPdfFile(
        payload.publicId,
        payload.fileUrl,
      );
      const content =
        await this.documentContentExtractorService.extractFromPdfBuffer(
          pdfBuffer,
        );

      await this.saveExtractedContent(payload.documentId, content);
    } catch (error) {
      console.error(
        `[DocumentContent] Failed to extract PDF content for document ${payload.documentId}`,
        error,
      );
    }
  }

  @OnEvent(DOCUMENT_CONTENT_EVENTS.EXTRACT_MARKDOWN, { async: true })
  async handleExtractMarkdownContent(payload: ExtractMarkdownContentPayload) {
    try {
      const content = this.documentContentExtractorService.extractFromMarkdown(
        payload.markdownContent,
      );

      await this.saveExtractedContent(payload.documentId, content);
    } catch (error) {
      console.error(
        `[DocumentContent] Failed to extract markdown content for document ${payload.documentId}`,
        error,
      );
    }
  }

  @OnEvent('document.created')
  async handleDocumentCreated(payload: {
    documentId: string;
    workspaceId: string;
    ownerId: string;
  }) {
    const { documentId, workspaceId, ownerId } = payload;

    // Tìm tất cả thành viên của workspace
    const members = await this.workspaceMemberModel
      .find({
        workspaceId: new Types.ObjectId(workspaceId),
        isDeleted: { $ne: true },
      })
      .lean()
      .exec();

    // Lọc ra các thành viên không phải là người tạo
    const membersExceptOwner = members.filter(
      (member) => member.userId.toString() !== ownerId,
    );

    const adminDocuments = membersExceptOwner
      .filter(
        (member) =>
          member.roleId.toString() === ROLE_IDS.ADMIN_WORKSPACE.toString(),
      )
      .map((m) => ({
        documentId: new Types.ObjectId(documentId),
        userId: m.userId,
        roleId: DOCUMENT_ROLE_IDS.OWNER,
        joinedAt: new Date(),
      }));

    const editorDocuments = membersExceptOwner
      .filter(
        (member) =>
          member.roleId.toString() !== ROLE_IDS.ADMIN_WORKSPACE.toString(),
      )
      .map((m) => ({
        documentId: new Types.ObjectId(documentId),
        userId: m.userId,
        roleId: DOCUMENT_ROLE_IDS.EDITOR,
        joinedAt: new Date(),
      }));

    const docsToInsert = [...adminDocuments, ...editorDocuments];

    if (docsToInsert.length > 0) {
      await this.documentMemberModel
        .insertMany(docsToInsert)
        .catch((e) => console.error('[Event Error]', e));
    }
  }

  @OnEvent('workspace.member.added')
  async handleWorkspaceMemberAdded(payload: {
    workspaceId: string;
    userId: string;
  }) {
    const { workspaceId, userId } = payload;

    // Lấy toàn bộ Document đang có trong Workspace đó
    const documents = await this.documentModel
      .find({
        workspaceId: new Types.ObjectId(workspaceId),
        isDeleted: { $ne: true },
      })
      .select('_id')
      .lean()
      .exec();

    if (documents.length === 0) return;

    // Chuẩn bị lệnh bulkWrite (Upsert) để chống lỗi Duplicate Key nếu họ đã từng có quyền
    const bulkOps = documents.map((doc) => ({
      updateOne: {
        filter: { documentId: doc._id, userId: new Types.ObjectId(userId) },
        update: {
          $setOnInsert: {
            documentId: doc._id,
            userId: new Types.ObjectId(userId),
            roleId: DOCUMENT_ROLE_IDS.EDITOR,
            joinedAt: new Date(),
            isDeleted: false,
          },
        },
        upsert: true,
      },
    }));

    await this.documentMemberModel
      .bulkWrite(bulkOps)
      .catch((e) => console.error('[Event Error]', e));
  }
}
