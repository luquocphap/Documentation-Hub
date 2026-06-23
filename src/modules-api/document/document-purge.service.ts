import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CloudinaryService } from 'src/modules-system/cloudinary/cloudinary.service';
import { RedisService } from 'src/modules-system/redis/redis.service';
import { CommentReply } from '../comment/schemas/comment-replies.schema';
import { DocumentAnnotation } from '../comment/schemas/document-annotations.schema';
import { DocumentComment } from '../comment/schemas/document-comments.schema';
import { DocumentInvitation } from './schemas/document-invitation.schemas';
import { DocumentMember } from './schemas/document-members.schema';
import { DocumentModel } from './schemas/documents.schema';

const DOCUMENT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

type PurgeCandidate = {
  _id: Types.ObjectId;
  public_id?: string;
};

export type DocumentPurgeFailure = {
  documentId: string;
  stage: 'cloudinary' | 'database';
  message: string;
};

export type DocumentPurgeSummary = {
  cutoff: Date;
  scanned: number;
  purged: number;
  failed: number;
  failures: DocumentPurgeFailure[];
};

@Injectable()
export class DocumentPurgeService {
  constructor(
    @InjectModel(DocumentModel.name)
    private readonly documentModel: Model<DocumentModel>,
    @InjectModel(DocumentMember.name)
    private readonly documentMemberModel: Model<DocumentMember>,
    @InjectModel(DocumentInvitation.name)
    private readonly documentInvitationModel: Model<DocumentInvitation>,
    @InjectModel(DocumentComment.name)
    private readonly documentCommentModel: Model<DocumentComment>,
    @InjectModel(DocumentAnnotation.name)
    private readonly documentAnnotationModel: Model<DocumentAnnotation>,
    @InjectModel(CommentReply.name)
    private readonly commentReplyModel: Model<CommentReply>,
    private readonly cloudinaryService: CloudinaryService,
    private readonly redisService: RedisService,
  ) {}

  async purgeExpiredDocuments(
    referenceDate = new Date(),
  ): Promise<DocumentPurgeSummary> {
    const cutoff = new Date(referenceDate.getTime() - DOCUMENT_RETENTION_MS);
    const summary: DocumentPurgeSummary = {
      cutoff,
      scanned: 0,
      purged: 0,
      failed: 0,
      failures: [],
    };

    const cursor = this.documentModel
      .find({
        isDeleted: true,
        deletedAt: { $ne: null, $lte: cutoff },
      })
      .select({ _id: 1, public_id: 1 })
      .lean<PurgeCandidate>()
      .cursor();

    for await (const document of cursor) {
      summary.scanned += 1;
      const documentId = document._id.toString();

      if (document.public_id?.trim()) {
        try {
          await this.cloudinaryService.deleteFile(document.public_id);
        } catch (error) {
          this.recordFailure(summary, documentId, 'cloudinary', error);
          continue;
        }
      }

      try {
        await this.purgeDocumentData(document._id, cutoff);
        await this.redisService.getClient().del(`document:${documentId}`);
        summary.purged += 1;
      } catch (error) {
        this.recordFailure(summary, documentId, 'database', error);
      }
    }

    return summary;
  }

  private async purgeDocumentData(
    documentId: Types.ObjectId,
    cutoff: Date,
  ): Promise<void> {
    const comments = await this.documentCommentModel
      .find({ documentId })
      .select({ _id: 1 })
      .lean()
      .exec();
    const commentIds = comments.map((comment) => comment._id);

    if (commentIds.length > 0) {
      await this.commentReplyModel
        .deleteMany({ commentId: { $in: commentIds } })
        .exec();
    }

    await this.documentCommentModel.deleteMany({ documentId }).exec();
    await this.documentAnnotationModel.deleteMany({ documentId }).exec();
    await this.documentMemberModel.deleteMany({ documentId }).exec();
    await this.documentInvitationModel.deleteMany({ documentId }).exec();

    const result = await this.documentModel
      .deleteOne({
        _id: documentId,
        isDeleted: true,
        deletedAt: { $ne: null, $lte: cutoff },
      })
      .exec();

    if (result.deletedCount !== 1) {
      throw new Error('Document is no longer eligible for purge.');
    }
  }

  private recordFailure(
    summary: DocumentPurgeSummary,
    documentId: string,
    stage: DocumentPurgeFailure['stage'],
    error: unknown,
  ): void {
    summary.failed += 1;
    summary.failures.push({
      documentId,
      stage,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
