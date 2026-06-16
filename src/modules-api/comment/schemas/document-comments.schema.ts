import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from 'src/modules-api/auth/schemas/user.schema';
import { DocumentAnnotation } from './document-annotations.schema';
import { DocumentModel } from 'src/modules-api/document/schemas/documents.schema';

export type DocumentCommentDocument = HydratedDocument<DocumentComment>;

export enum DocumentCommentStatus {
  OPEN = 'OPEN',
  RESOLVED = 'RESOLVED',
}

@Schema({
  collection: 'document_comments',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  versionKey: false,
})
export class DocumentComment {
  @Prop({
    type: Types.ObjectId,
    ref: DocumentModel.name,
    required: true,
    index: true,
  })
  documentId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 5000 })
  text!: string;

  @Prop({ type: String, trim: true, default: null })
  selectedText!: string | null;

  @Prop({ type: Number, required: true, min: 1, index: true })
  pageNumber!: number;

  @Prop({
    type: String,
    enum: DocumentCommentStatus,
    default: DocumentCommentStatus.OPEN,
    index: true,
  })
  status!: DocumentCommentStatus;

  @Prop({ type: Number, default: 0 })
  replyCount!: number;

  @Prop({
    type: Types.ObjectId,
    ref: DocumentAnnotation.name,
    default: null,
    index: true,
  })
  annotationRef!: Types.ObjectId | null;

  @Prop({ type: String, trim: true, default: null, index: true })
  annotationId!: string | null;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  owner!: Types.ObjectId;

  @Prop({ type: Boolean, default: false, index: true })
  isDeleted!: boolean;

  @Prop({ type: Date, default: null })
  deletedAt!: Date | null;

  @Prop({ type: Boolean, default: false })
  isUpdated!: boolean;
}

export const DocumentCommentSchema =
  SchemaFactory.createForClass(DocumentComment);

DocumentCommentSchema.index({
  documentId: 1,
  pageNumber: 1,
  isDeleted: 1,
  created_at: -1,
});
DocumentCommentSchema.index({ documentId: 1, status: 1, isDeleted: 1 });
