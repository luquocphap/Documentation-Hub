import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Request } from 'express';
import { Model, Types } from 'mongoose';
import { buildQueryMongoose } from 'src/common/helpers/build-query-mongoose.helper';
import { type UserDocument } from '../auth/schemas/user.schema';
import { DocumentMember } from '../document/schemas/document-members.schema';
import { DocumentModel } from '../document/schemas/documents.schema';

@Injectable()
export class SearchService {
  constructor(
    @InjectModel(DocumentModel.name)
    private readonly documentModel: Model<DocumentModel>,
    @InjectModel(DocumentMember.name)
    private readonly documentMemberModel: Model<DocumentMember>,
  ) {}

  async searchDocuments(req: Request, user: UserDocument) {
    const { page, pageSize, skip, limit, filter, sort } =
      buildQueryMongoose(req);

    const accessibleDocumentIds = await this.documentMemberModel
      .find({
        userId: new Types.ObjectId(user._id),
        isDeleted: { $ne: true },
      })
      .distinct('documentId')
      .exec();

    if (accessibleDocumentIds.length === 0) {
      return {
        items: [],
        pagination: this.buildPagination(page, pageSize, 0),
      };
    }

    const documentFilter = {
      ...filter,
      _id: { $in: accessibleDocumentIds },
    };

    const [total, documents] = await Promise.all([
      this.documentModel.countDocuments(documentFilter).exec(),
      this.documentModel
        .find(documentFilter)
        .populate('createdBy', 'fullName email')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
    ]);

    return {
      items: documents.map((document: any) => ({
        id: document._id,
        title: document.title,
        workspaceId: document.workspaceId,
        public_id: document.public_id,
        ownerId: document.createdBy?._id ?? document.createdBy,
        ownerName: document.createdBy?.fullName ?? 'Unknown',
        ownerEmail: document.createdBy?.email,
        contentPreview: this.buildContentPreview(document.content),
        updatedAt: document.updated_at,
        createdAt: document.created_at,
      })),
      pagination: this.buildPagination(page, pageSize, total),
    };
  }

  private buildContentPreview(content?: string) {
    if (!content) return '';
    return content.length > 240 ? `${content.slice(0, 240)}...` : content;
  }

  private buildPagination(page: number, pageSize: number, total: number) {
    const totalPages = Math.ceil(total / pageSize);

    return {
      page,
      pageSize,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1 && totalPages > 0,
    };
  }
}
