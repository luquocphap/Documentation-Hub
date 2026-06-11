import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { DocumentModel } from './documents.schema';
import { DocumentRole } from './document-roles.schema';
import { User } from 'src/modules-api/auth/schemas/user.schema';

export type DocumentMemberDocument = HydratedDocument<DocumentMember>;

@Schema({
  collection: 'document_members',
  timestamps: false,
  versionKey: false,
})
export class DocumentMember {
  @Prop({ type: Types.ObjectId, ref: DocumentModel.name, required: true, index: true })
  documentId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: DocumentRole.name, required: true })
  roleId!: Types.ObjectId;

  @Prop({ required: true, default: () => new Date() })
  joinedAt!: Date;

  @Prop({ default: false })
  isDeleted!: boolean;
}

export const DocumentMemberSchema = SchemaFactory.createForClass(DocumentMember);

// 1 User chỉ có 1 Role trên 1 Document
DocumentMemberSchema.index(
  { documentId: 1, userId: 1 }, 
  { unique: true, partialFilterExpression: { isDeleted: false } }
);