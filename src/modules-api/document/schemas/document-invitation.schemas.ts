import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { DocumentModel } from './documents.schema';
import { DocumentRole } from './document-roles.schema';
import { User } from 'src/modules-api/auth/schemas/user.schema';

export type DocumentInvitationDocument = HydratedDocument<DocumentInvitation>;

export enum InvitationStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  EXPIRED = 'EXPIRED',
  CANCELED = 'CANCELED',
}

@Schema({
  collection: 'document_invitations',
  timestamps: { createdAt: 'invitedAt', updatedAt: false },
  versionKey: false,
})
export class DocumentInvitation {
  @Prop({ required: true, lowercase: true, trim: true, index: true })
  email!: string;

  @Prop({ type: Types.ObjectId, ref: DocumentModel.name, required: true })
  documentId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: DocumentRole.name, required: true })
  roleId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  inviterId!: Types.ObjectId;

  @Prop({
    type: String,
    enum: InvitationStatus,
    default: InvitationStatus.PENDING,
    index: true,
  })
  status!: InvitationStatus;

  @Prop({
    required: true,
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    index: true,
  })
  expiresAt!: Date;
}

export const DocumentInvitationSchema =
  SchemaFactory.createForClass(DocumentInvitation);
DocumentInvitationSchema.index({ email: 1, documentId: 1, status: 1 });
DocumentInvitationSchema.index({ documentId: 1, status: 1 });
