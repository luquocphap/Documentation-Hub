import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Request } from 'express';
import { Model, Types } from 'mongoose';
import { type UserDocument } from '../auth/schemas/user.schema';
import { DocumentMember } from '../document/schemas/document-members.schema';
import { DocumentModel } from '../document/schemas/documents.schema';
import { buildQueryDocuments } from 'src/common/helpers/build-query-documents.helper';

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
      buildQueryDocuments(req);
    const keyword = this.getSearchKeyword(req);

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
        .populate('workspaceId', 'name')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
    ]);

    return {
      items: documents.map((document: any) => {
        const matchedField = this.getMatchedField(
          document.title,
          document.content,
          keyword,
        );

        return {
          id: document._id,
          title: document.title,
          workspaceId: document.workspaceId._id,
          workspaceName: document.workspaceId.name,
          public_id: document.public_id,
          ownerId: document.createdBy?._id ?? document.createdBy,
          ownerName: document.createdBy?.fullName ?? 'Unknown',
          ownerEmail: document.createdBy?.email,
          contentPreview: this.buildContentPreview(document.content, keyword),
          matchedField,
          updatedAt: document.updated_at,
          createdAt: document.created_at,
        };
      }),
      pagination: this.buildPagination(page, pageSize, total),
    };
  }

  private getSearchKeyword(req: Request) {
    const search = req.query.search;

    if (typeof search !== 'string') return undefined;

    const keyword = search.trim();
    return keyword || undefined;
  }

  private getMatchedField(
    title?: string,
    content?: string,
    keyword?: string,
  ): 'content' | 'title' | null {
    if (!keyword) return null;

    if (this.findKeywordIndex(content, keyword) >= 0) {
      return 'content';
    }

    if (this.findKeywordIndex(title, keyword) >= 0) {
      return 'title';
    }

    return null;
  }

  private buildContentPreview(content?: string, keyword?: string) {
    if (!content) return '';

    const previewLength = 150;
    const matchIndex = keyword ? this.findKeywordIndex(content, keyword) : -1;

    if (matchIndex < 0 || !keyword) {
      return this.truncatePreview(content, previewLength);
    }

    // get length and index of the mid of the slice before keyword
    const targetLength = Math.max(previewLength, keyword.length);
    const contextBefore = Math.floor((targetLength - keyword.length) / 2);
    let start = Math.max(0, matchIndex - contextBefore);
    let end = Math.min(content.length, start + targetLength);

    // if current length is smaller than target length, get the start smaller to reach target length
    if (end - start < targetLength) {
      start = Math.max(0, end - targetLength);
    }

    const keywordEnd = matchIndex + keyword.length;
    // beautify
    const wordBoundaryStart = this.moveStartToWordBoundary(content, start);
    const wordBoundaryEnd = this.moveEndToWordBoundary(content, end);

    // avoid start/end reach the keyword
    if (wordBoundaryStart < matchIndex) {
      start = wordBoundaryStart;
    }

    if (wordBoundaryEnd > keywordEnd) {
      end = wordBoundaryEnd;
    }

    const prefix = start > 0 ? '...' : '';
    const suffix = end < content.length ? '...' : '';

    return `${prefix}${content.slice(start, end).trim()}${suffix}`;
  }

  private findKeywordIndex(value: string | undefined, keyword: string) {
    if (!value) return -1;

    return value.toLowerCase().indexOf(keyword.toLowerCase());
  }

  private truncatePreview(content: string, maxLength: number) {
    if (content.length <= maxLength) return content;

    const end = this.moveEndToWordBoundary(content, maxLength);
    return `${content.slice(0, end).trim()}...`;
  }

  private moveStartToWordBoundary(content: string, start: number) {
    if (start === 0) return start;

    const nextSpace = content.indexOf(' ', start);

    if (nextSpace === -1) return start;

    return nextSpace + 1;
  }

  private moveEndToWordBoundary(content: string, end: number) {
    if (end >= content.length) return content.length;

    const previousSpace = content.lastIndexOf(' ', end);

    if (previousSpace === -1) return end;

    return previousSpace;
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
