import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { InjectModel } from '@nestjs/mongoose';
import { DocumentModel } from './schemas/documents.schema';
import { Model, Types } from 'mongoose';
import { UserDocument } from '../auth/schemas/user.schema';
import { CloudinaryService } from 'src/modules-system/cloudinary/cloudinary.service';
import { DocumentMember } from './schemas/document-members.schema';
import { DOCUMENT_ROLE_IDS } from 'src/common/seeds/document-role.seed';
import MarkdownIt from 'markdown-it';
import { PdfService } from 'src/modules-system/pdf/pdf.service';
import { CreateDocumentMarkdownDto } from './dto/create-document-markdown.dto';
import { generateHtmlDocument } from 'src/common/helpers/generate-html-document.helper';

@Injectable()
export class DocumentService {
  constructor(
    @InjectModel(DocumentModel.name) private readonly documentModel: Model<DocumentModel>,
    @InjectModel(DocumentMember.name) private readonly documentMemberModel: Model<DocumentMember>,
    private readonly cloudinaryService: CloudinaryService,
    private readonly pdfService: PdfService
  ) {}
  private async generateUniqueTitle(workspaceId: Types.ObjectId, baseTitle: string): Promise<string> {
    // Escape các ký tự đặc biệt của regex trong baseTitle
    const escapedTitle = baseTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Tìm các file có tên chính xác hoặc có dạng "Tên (1)", "Tên (2)"
    const regex = new RegExp(`^${escapedTitle}( \\(\\d+\\))?$`, 'i');

    const existingDocs = await this.documentModel.find({
      workspaceId,
      title: { $regex: regex },
      isDeleted: { $ne: true }
    }).exec();

    if (existingDocs.length === 0) return baseTitle;

    const existingTitles = existingDocs.map(doc => doc.title);
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
    if (!workspaceId) throw new BadRequestException('Vui lòng cung cấp workspaceId');


    const documents = await this.documentModel.find({
      workspaceId: new Types.ObjectId(workspaceId),
      isDeleted: { $ne: true }
    })
    .populate('createdBy', 'fullName _id')
    .sort({ updated_at: -1 }) // Mới nhất lên trước
    .exec();

    return documents.map((doc: any) => ({
      id: doc._id,
      title: doc.title,
      ownerName: doc.createdBy?.fullName || 'Unknown',
      ownerId: doc.createdBy?._id || "Unknown",
      updatedAt: doc.updated_at
    }));
  }

  async create(createDocumentDto: CreateDocumentDto, user: UserDocument) {
    const workspaceId = new Types.ObjectId(createDocumentDto.workspaceId);
    
    // Xử lý chống trùng tên
    const uniqueTitle = await this.generateUniqueTitle(workspaceId, createDocumentDto.title);

    const newDocument = await this.documentModel.create({
      workspaceId,
      title: uniqueTitle,
      public_id: "", // Sẽ được cập nhật khi user thực sự gọi upload file
      createdBy: user._id
    });

    await this.documentMemberModel.create({
      documentId: newDocument._id,
      userId: user._id,
      roleId: DOCUMENT_ROLE_IDS.OWNER,
      joinedAt: new Date()
    });

    return newDocument;
  }

  async getUploadSignature(documentId: string, user: UserDocument) {
    // Check xem document tồn tại và user có quyền không (Guard đã check, nhưng check lại DB cho chắc)
    const document = await this.documentModel.findOne({
      _id: new Types.ObjectId(documentId),
      isDeleted: { $ne: true }
    });

    if (!document) {
      throw new NotFoundException('Tài liệu không tồn tại hoặc đã bị xóa');
    }

    // Lấy thông số từ Cloudinary Service
    const signatureData = this.cloudinaryService.generatePresignedSignature(documentId, user._id.toString());
    
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
        isDeleted: { $ne: true }
      });

      if (document) {
        // (Tùy chọn) Xóa file cũ trên Cloudinary để tránh rác nếu là hành động ghi đè
        if (document.public_id) {
          await this.cloudinaryService.deleteFile(document.public_id).catch(e => console.error('Lỗi xóa file cũ:', e));
        }

        // Cập nhật record với public_id mới và người cập nhật
        document.public_id = public_id;
        document.updatedAt = new Date();
        document.updatedBy = new Types.ObjectId(userId);
        await document.save();
        
        console.log(`[Webhook] Cập nhật thành công file cho document: ${documentId}`);
      }
    }

    return { message: 'Webhook processed successfully' };
  }

  async update(documentId: string, updateDocumentDto: UpdateDocumentDto, user: UserDocument) {
    const document = await this.documentModel.findOne({
      _id: new Types.ObjectId(documentId),
      isDeleted: { $ne: true }
    });

    if (!document) {
      throw new NotFoundException('Tài liệu không tồn tại hoặc đã bị xóa');
    }

    // Nếu đổi sang tên mới, lại kiểm tra trùng tên
    if (updateDocumentDto.title && updateDocumentDto.title !== document.title) {
      const uniqueTitle = await this.generateUniqueTitle(document.workspaceId, updateDocumentDto.title);
      document.title = uniqueTitle;
    }

    document.updatedBy = user._id as Types.ObjectId;
    await document.save();

    return document;
  }

  async remove(documentId: string, user: UserDocument) {
    const document = await this.documentModel.findByIdAndUpdate(
      documentId,
      {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: user._id
      },
      { new: true }
    ).exec();

    if (!document) {
      throw new NotFoundException('Tài liệu không tồn tại');
    }

    return { message: 'Xóa tài liệu thành công' };
  }

  async getMyRole(documentId: string, user: UserDocument) {
    // Tìm kiếm record thành viên của user trong document này
    const member = await this.documentMemberModel.findOne({
      documentId: new Types.ObjectId(documentId),
      userId: user._id,
      isDeleted: { $ne: true }
    })
    .populate('roleId', 'name')
    .exec();

    if (!member) {
      throw new ForbiddenException('Bạn không có quyền truy cập tài liệu này hoặc tài liệu không tồn tại');
    }

    return {
      role: (member.roleId as any)?.name || 'Unknown'
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
      throw new BadRequestException('Lỗi trong quá trình upload PDF lên đám mây');
    }

    // Lưu Database
    const newDocument = await this.documentModel.create({
      workspaceId: workspaceObjId,
      title: uniqueTitle,
      public_id: uploadResult.public_id,
      createdBy: user._id
    });

    // Cấp quyền OWNER
    await this.documentMemberModel.create({
      documentId: newDocument._id,
      userId: user._id,
      roleId: DOCUMENT_ROLE_IDS.OWNER,
      joinedAt: new Date()
    });

    return newDocument;
  }

  async findOne(documentId: string) {
    const document = await this.documentModel.findOne({
      _id: new Types.ObjectId(documentId),
      isDeleted: { $ne: true }
    })
    .exec();

    if (!document) {
      throw new NotFoundException('Tài liệu không tồn tại hoặc đã bị xóa');
    }

    return {
      _id: document._id,
      workspaceId: document.workspaceId,
      title: document.title,
      public_id: document.public_id,
      createdAt: (document as any).created_at,
      updatedAt: (document as any).updated_at,
    };
  }
}