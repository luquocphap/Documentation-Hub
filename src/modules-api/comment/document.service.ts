import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DocumentComment } from './schemas/document-comments.schema';
import { DocumentAnnotation } from './schemas/document-annotations.schema';
import { CreateDocumentCommentDto } from './dto/create-document-comment.dto';
import { UpdateDocumentCommentDto } from './dto/update-document-comment.dto';
import { UserDocument } from '../auth/schemas/user.schema';
import { CommentReply } from './schemas/comment-replies.schema';

@Injectable()
export class CommentService {
  constructor(
    @InjectModel(DocumentComment.name) private commentModel: Model<DocumentComment>,
    @InjectModel(DocumentAnnotation.name) private annotationModel: Model<DocumentAnnotation>,
    @InjectModel(CommentReply.name) private replyModel: Model<CommentReply>
  ) {}

  async findRepliesByComment(commentId: string) {
    return this.replyModel
        .find({ commentId: new Types.ObjectId(commentId), isDeleted: false })
        .populate('createdBy', 'fullName')
        .sort({ created_at: 1 })
        .exec();
  }

  // Lấy danh sách comment của một document
  async findAllByDocument(documentId: string) {
    return this.commentModel
      .find({ documentId: new Types.ObjectId(documentId), isDeleted: false })
      .populate('annotationRef')
      .populate('createdBy', 'fullName')
      .sort({ created_at: -1 })
      .exec();
  }

  async createReply(commentId: string, user: UserDocument, text: string) {
    const comment = await this.commentModel.findOne({
        _id: new Types.ObjectId(commentId),
        isDeleted: false,
    });

    if (!comment) {
        throw new NotFoundException('Không tìm thấy comment gốc hoặc comment đã bị xóa');
    }

    // Tạo reply mới
    const newReply = new this.replyModel({
        commentId: new Types.ObjectId(commentId),
        text,
        createdBy: new Types.ObjectId(user._id),
    });
    const savedReply = await newReply.save();

    // Tăng số lượng reply của comment gốc lên 1 đơn vị
    await this.commentModel.findByIdAndUpdate(commentId, {
        $inc: { replyCount: 1 },
    });

    return savedReply.populate('createdBy', 'fullName');
   }

  // Tạo mới một comment (và annotation nếu có)
  async create(user: UserDocument, documentId: string, createDto: CreateDocumentCommentDto) {
    let annotationRefId: Types.ObjectId | null = null;
    const { annotation, ...commentData } = createDto;

    // Nếu có gửi kèm thông tin annotation, tạo annotation trước
    if (annotation) {
      const newAnnotation = new this.annotationModel({
        ...annotation,
        documentId: new Types.ObjectId(documentId),
        createdBy: new Types.ObjectId(user._id),
      });
      const savedAnnotation = await newAnnotation.save();
      annotationRefId = savedAnnotation._id;
    }

    // Tạo comment và liên kết với annotation (nếu có)
    const newComment = new this.commentModel({
      ...commentData,
      documentId: new Types.ObjectId(documentId),
      annotationRef: annotationRefId,
      createdBy: new Types.ObjectId(user._id),
    });

    const savedComment = await newComment.save();
    return savedComment.populate('createdBy', 'fullName');
  }

  // Cập nhật comment (và annotation nếu có)
  async update(commentId: string, user: UserDocument, updateDto: UpdateDocumentCommentDto) {
    const comment = await this.commentModel.findOne({ 
      _id: new Types.ObjectId(commentId), 
      isDeleted: false 
    });

    if (!comment) {
      throw new NotFoundException('Không tìm thấy comment hoặc comment đã bị xóa');
    }

    const { annotation, ...commentUpdateData } = updateDto;

    // Nếu có cập nhật annotation và comment này đã được link với 1 annotation trước đó
    if (annotation && comment.annotationRef) {
      await this.annotationModel.findByIdAndUpdate(
        comment.annotationRef,
        {
          ...annotation,
          updatedBy: new Types.ObjectId(user._id),
        },
        { returnDocument: "after" }
      );
    }

    // Cập nhật thông tin comment
    Object.assign(comment, commentUpdateData);
    comment.updatedBy = new Types.ObjectId(user._id);

    return comment.save();
  }

  // Xóa mềm comment (và annotation đi kèm)
  async remove(commentId: string, user: UserDocument) {
    const comment = await this.commentModel.findOne({ 
      _id: new Types.ObjectId(commentId), 
      isDeleted: false 
    });

    if (!comment) {
      throw new NotFoundException('Không tìm thấy comment hoặc comment đã bị xóa');
    }

    const now = new Date();

    // Xóa mềm comment
    comment.isDeleted = true;
    comment.deletedAt = now;
    comment.deletedBy = new Types.ObjectId(user._id);
    await comment.save();

    // Xóa mềm annotation tương ứng (nếu có)
    if (comment.annotationRef) {
      await this.annotationModel.findByIdAndUpdate(
        comment.annotationRef,
        {
          isDeleted: true,
          deletedAt: now,
          deletedBy: new Types.ObjectId(user._id),
        }
      );
    }

    return { message: 'Xóa comment thành công', commentId };
  }
}
