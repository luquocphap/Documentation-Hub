import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from 'src/modules-api/auth/schemas/user.schema';
import { DocumentComment } from './document-comments.schema';

export type CommentReplyDocument = HydratedDocument<CommentReply>;

@Schema({
  collection: 'comment_replies',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  versionKey: false,
})
export class CommentReply {
  @Prop({
    type: Types.ObjectId,
    ref: DocumentComment.name,
    required: true,
    index: true,
  })
  commentId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 5000 })
  text!: string;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  createdBy!: Types.ObjectId;

  @Prop({ type: Boolean, default: false, index: true })
  isDeleted!: boolean;

  @Prop({ type: Date, default: null })
  deletedAt!: Date | null;
}

export const CommentReplySchema = SchemaFactory.createForClass(CommentReply);

CommentReplySchema.index({ commentId: 1, isDeleted: 1, created_at: 1 });