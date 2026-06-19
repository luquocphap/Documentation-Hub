import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DocumentComment } from './schemas/document-comments.schema';
import { DocumentAnnotation } from './schemas/document-annotations.schema';
import { CreateDocumentCommentDto } from './dto/create-document-comment.dto';
import { UpdateDocumentCommentDto } from './dto/update-document-comment.dto';
import { UserDocument } from '../auth/schemas/user.schema';
import { CommentReply } from './schemas/comment-replies.schema';
import {
  CreateCommentReplyDto,
  UpdateCommentReplyDto,
} from './dto/comment-reply.dto';
import { SocketGateway } from 'src/modules-system/socket/socket.gateway';
import {
  DocumentCommentRealtimePayload,
  RealtimeDocumentAnnotation,
} from './types/comment-realtime.types';
import { DocumentCommentStatus } from './schemas/document-comments.schema';

type PopulatedCommentOwner = {
  _id: Types.ObjectId;
  fullName: string;
};

type PopulatedDocumentAnnotation = {
  _id: Types.ObjectId;
  documentId: Types.ObjectId;
  annotationId: string;
  type: string;
  pageNumber: number;
  quads: Record<string, unknown>[];
  rect: Record<string, unknown> | null;
  contents: string;
  color: string;
  opacity: number;
  xfdf: string | null;
  owner: Types.ObjectId;
  created_at: Date;
  updated_at: Date;
};

type PopulatedDocumentComment = {
  _id: Types.ObjectId;
  documentId: Types.ObjectId;
  text: string;
  selectedText: string | null;
  pageNumber: number;
  status: DocumentCommentStatus;
  replyCount: number;
  annotationRef: Types.ObjectId | PopulatedDocumentAnnotation | null;
  annotationId: string | null;
  owner: Types.ObjectId | PopulatedCommentOwner;
  created_at: Date;
  updated_at: Date;
  isUpdated: boolean;
};

@Injectable()
export class CommentService {
  constructor(
    @InjectModel(DocumentComment.name)
    private commentModel: Model<DocumentComment>,
    @InjectModel(DocumentAnnotation.name)
    private annotationModel: Model<DocumentAnnotation>,
    @InjectModel(CommentReply.name)
    private replyModel: Model<CommentReply>,
    private readonly socketGateway: SocketGateway,
  ) {}

  private emitRealtime(eventName: string, emit: () => void) {
    try {
      emit();
    } catch (error) {
      console.error(`[CommentRealtime] Failed to emit ${eventName}`, error);
    }
  }

  private mapAnnotation(
    annotation: PopulatedDocumentComment['annotationRef'],
  ): RealtimeDocumentAnnotation | string | null {
    if (!annotation) {
      return null;
    }

    if (annotation instanceof Types.ObjectId) {
      return annotation.toString();
    }

    return {
      _id: annotation._id.toString(),
      documentId: annotation.documentId.toString(),
      annotationId: annotation.annotationId,
      type: annotation.type,
      pageNumber: annotation.pageNumber,
      quads: annotation.quads,
      rect: annotation.rect,
      contents: annotation.contents,
      color: annotation.color,
      opacity: annotation.opacity,
      xfdf: annotation.xfdf,
      owner: annotation.owner.toString(),
      created_at: annotation.created_at.toISOString(),
      updated_at: annotation.updated_at.toISOString(),
    };
  }

  private mapComment(
    comment: PopulatedDocumentComment,
  ): DocumentCommentRealtimePayload {
    const owner =
      comment.owner instanceof Types.ObjectId ? undefined : comment.owner;
    const ownerId =
      comment.owner instanceof Types.ObjectId
        ? comment.owner.toString()
        : comment.owner._id.toString();

    return {
      _id: comment._id.toString(),
      documentId: comment.documentId.toString(),
      text: comment.text,
      selectedText: comment.selectedText,
      pageNumber: comment.pageNumber,
      status: comment.status,
      replyCount: comment.replyCount,
      annotationRef: this.mapAnnotation(comment.annotationRef),
      annotationId: comment.annotationId,
      owner: {
        id: ownerId,
        fullName: owner?.fullName ?? 'Unknown',
      },
      created_at: comment.created_at.toISOString(),
      updated_at: comment.updated_at.toISOString(),
      isUpdated: comment.isUpdated,
    };
  }

  private async getCommentPayload(
    commentId: string | Types.ObjectId,
  ): Promise<DocumentCommentRealtimePayload> {
    const comment = await this.commentModel
      .findOne({
        _id: new Types.ObjectId(commentId.toString()),
        isDeleted: false,
      })
      .populate('annotationRef')
      .populate('owner', 'fullName')
      .lean()
      .exec();

    if (!comment) {
      throw new NotFoundException('Khong tim thay comment');
    }

    return this.mapComment(comment as unknown as PopulatedDocumentComment);
  }

  private assertOwner(
    ownerId: Types.ObjectId | string | null | undefined,
    user: UserDocument,
    resourceName: string,
  ) {
    if (!ownerId || ownerId.toString() !== user._id.toString()) {
      throw new BadRequestException(
        `Ban khong phai owner cua ${resourceName} nay`,
      );
    }
  }

  private async findActiveCommentOrFail(commentId: string) {
    const comment = await this.commentModel.findOne({
      _id: new Types.ObjectId(commentId),
      isDeleted: false,
    });

    if (!comment) {
      throw new NotFoundException(
        'Khong tim thay comment hoac comment da bi xoa',
      );
    }

    return comment;
  }

  async findRepliesByComment(commentId: string) {
    return this.replyModel
      .find({ commentId: new Types.ObjectId(commentId) })
      .populate('owner', 'fullName')
      .sort({ created_at: 1 })
      .exec();
  }

  async findAllByDocument(documentId: string) {
    return this.commentModel
      .find({ documentId: new Types.ObjectId(documentId), isDeleted: false })
      .populate('annotationRef')
      .populate('owner', 'fullName')
      .sort({ created_at: -1 })
      .exec();
  }

  async createReply(
    commentId: string,
    user: UserDocument,
    createDto: CreateCommentReplyDto,
  ) {
    const comment = await this.findActiveCommentOrFail(commentId);

    const newReply = new this.replyModel({
      commentId: comment._id,
      text: createDto.text,
      owner: new Types.ObjectId(user._id),
    });
    const savedReply = await newReply.save();

    const updatedComment = await this.commentModel
      .findOneAndUpdate(
        {
          _id: comment._id,
          isDeleted: false,
        },
        {
          $inc: { replyCount: 1 },
        },
        {
          returnDocument: 'after',
        },
      )
      .select('documentId replyCount')
      .lean()
      .exec();

    if (!updatedComment) {
      throw new NotFoundException(
        'Khong tim thay comment hoac comment da bi xoa',
      );
    }

    this.emitRealtime('reply:created_summary', () => {
      this.socketGateway.emitReplyCreatedSummary({
        documentId: updatedComment.documentId.toString(),
        commentId,
        replyCount: updatedComment.replyCount,
      });
    });

    return savedReply.populate('owner', 'fullName');
  }

  async updateReply(
    commentId: string,
    replyId: string,
    user: UserDocument,
    updateDto: UpdateCommentReplyDto,
  ) {
    await this.findActiveCommentOrFail(commentId);

    const reply = await this.replyModel.findOne({
      _id: new Types.ObjectId(replyId),
      commentId: new Types.ObjectId(commentId),
      isDeleted: false,
    });

    if (!reply) {
      throw new NotFoundException('Khong tim thay reply hoac reply da bi xoa');
    }

    this.assertOwner(reply.owner, user, 'reply');

    reply.text = updateDto.text;
    reply.isUpdated = true;

    const savedReply = await reply.save();
    return savedReply.populate('owner', 'fullName');
  }

  async removeReply(commentId: string, replyId: string, user: UserDocument) {
    await this.findActiveCommentOrFail(commentId);

    const reply = await this.replyModel.findOne({
      _id: new Types.ObjectId(replyId),
      commentId: new Types.ObjectId(commentId),
      isDeleted: false,
    });

    if (!reply) {
      throw new NotFoundException('Khong tim thay reply hoac reply da bi xoa');
    }

    this.assertOwner(reply.owner, user, 'reply');

    reply.isDeleted = true;
    reply.deletedAt = new Date();
    await reply.save();

    return { message: 'Xoa reply thanh cong', replyId };
  }

  async create(
    user: UserDocument,
    documentId: string,
    createDto: CreateDocumentCommentDto,
  ) {
    let annotationRefId: Types.ObjectId | null = null;
    const { annotation, annotationRef, ...commentData } = createDto;

    if (annotation) {
      const newAnnotation = new this.annotationModel({
        ...annotation,
        documentId: new Types.ObjectId(documentId),
        owner: new Types.ObjectId(user._id),
      });
      const savedAnnotation = await newAnnotation.save();
      annotationRefId = savedAnnotation._id;
    } else if (annotationRef) {
      annotationRefId = new Types.ObjectId(annotationRef);
    }

    const newComment = new this.commentModel({
      ...commentData,
      documentId: new Types.ObjectId(documentId),
      annotationRef: annotationRefId,
      owner: new Types.ObjectId(user._id),
    });

    const savedComment = await newComment.save();
    const payload = await this.getCommentPayload(savedComment._id);

    this.emitRealtime('comment:created', () => {
      this.socketGateway.emitCommentCreated(documentId, payload);
    });

    return payload;
  }

  async update(
    commentId: string,
    user: UserDocument,
    updateDto: UpdateDocumentCommentDto,
  ) {
    const comment = await this.findActiveCommentOrFail(commentId);
    this.assertOwner(comment.owner, user, 'comment');

    const { annotation, ...commentUpdateData } = updateDto;

    if (annotation && comment.annotationRef) {
      await this.annotationModel.findByIdAndUpdate(
        comment.annotationRef,
        {
          ...annotation,
        },
        { returnDocument: 'after' },
      );
    }

    Object.assign(comment, commentUpdateData);
    comment.isUpdated = true;

    const savedComment = await comment.save();
    const payload = await this.getCommentPayload(savedComment._id);

    this.emitRealtime('comment:updated', () => {
      this.socketGateway.emitCommentUpdated(
        comment.documentId.toString(),
        payload,
      );
    });

    return payload;
  }

  async remove(commentId: string, user: UserDocument) {
    const comment = await this.findActiveCommentOrFail(commentId);
    this.assertOwner(comment.owner, user, 'comment');

    const now = new Date();
    let annotationId = comment.annotationId;

    if (!annotationId && comment.annotationRef) {
      const annotation = await this.annotationModel
        .findById(comment.annotationRef)
        .select('annotationId')
        .lean()
        .exec();

      annotationId = annotation?.annotationId ?? null;
    }

    comment.isDeleted = true;
    comment.deletedAt = now;
    await comment.save();

    if (comment.annotationRef) {
      await this.annotationModel.findByIdAndUpdate(comment.annotationRef, {
        isDeleted: true,
        deletedAt: now,
      });
    }

    void this.replyModel
      .deleteMany({ commentId: comment._id })
      .exec()
      .catch((error) =>
        console.error('Failed to delete comment replies', error),
      );

    this.emitRealtime('comment:deleted', () => {
      this.socketGateway.emitCommentDeleted({
        documentId: comment.documentId.toString(),
        commentId,
        annotationId,
      });
    });

    return { message: 'Xoa comment thanh cong', commentId };
  }
}
