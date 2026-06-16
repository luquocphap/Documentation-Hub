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

@Injectable()
export class CommentService {
  constructor(
    @InjectModel(DocumentComment.name)
    private commentModel: Model<DocumentComment>,
    @InjectModel(DocumentAnnotation.name)
    private annotationModel: Model<DocumentAnnotation>,
    @InjectModel(CommentReply.name)
    private replyModel: Model<CommentReply>,
  ) {}

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

    await this.commentModel.findByIdAndUpdate(commentId, {
      $inc: { replyCount: 1 },
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
    return savedComment.populate('owner', 'fullName');
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
    return savedComment.populate('owner', 'fullName');
  }

  async remove(commentId: string, user: UserDocument) {
    const comment = await this.findActiveCommentOrFail(commentId);
    this.assertOwner(comment.owner, user, 'comment');

    const now = new Date();

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

    return { message: 'Xoa comment thanh cong', commentId };
  }
}
