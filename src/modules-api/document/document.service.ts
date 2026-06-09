import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { InjectModel } from '@nestjs/mongoose';
import { DocumentModel } from './schemas/documents.schema';
import { Model, Types } from 'mongoose';
import { UserDocument } from '../auth/schemas/user.schema';
import { CloudinaryService } from 'src/modules-system/cloudinary/cloudinary.service';
import { DocumentMember } from './schemas/document-members.schema';
import { DOCUMENT_ROLE_IDS } from 'src/common/seeds/document-role.seed';

@Injectable()
export class DocumentService {
  constructor(
    @InjectModel(DocumentModel.name) private readonly documentModel: Model<DocumentModel>,
    @InjectModel(DocumentMember.name) private readonly documentMemberModel: Model<DocumentMember>,
    private readonly cloudinaryService: CloudinaryService
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
    .populate('createdBy', 'fullName')
    .sort({ updated_at: -1 }) // Mới nhất lên trước
    .exec();

    return documents.map((doc: any) => ({
      id: doc._id,
      title: doc.title,
      ownerName: doc.createdBy?.fullName || 'Unknown',
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

  async uploadFile(documentId: string, file: Express.Multer.File, user: UserDocument) {
    const document = await this.documentModel.findOne({
      _id: new Types.ObjectId(documentId),
      isDeleted: { $ne: true }
    });

    if (!document) {
      throw new NotFoundException('Tài liệu không tồn tại hoặc đã bị xóa');
    }

    // Gửi file lên Cloudinary
    const uploadResult = await this.cloudinaryService.uploadFile(file);
    if (!uploadResult || !uploadResult.public_id) {
      throw new BadRequestException('Upload tài liệu thất bại');
    }

    // (Tùy chọn) Xóa file cũ trên Cloudinary nếu đang ghi đè file
    if (document.public_id) {
      await this.cloudinaryService.deleteFile(document.public_id).catch(e => console.error(e));
    }

    // Cập nhật record với thông tin file
    document.public_id = uploadResult.public_id;
    document.updatedBy = user._id as Types.ObjectId;
    await document.save();

    return {
      message: 'Upload tài liệu thành công',
      public_id: document.public_id
    };
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
}