import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from 'src/modules-api/auth/schemas/user.schema';
import { Workspace } from 'src/modules-api/workspace/schemas/workspaces.schema';

export type DocumentModelDocument = HydratedDocument<DocumentModel>;

@Schema({
  collection: 'documents',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  versionKey: false,
})
export class DocumentModel {
  @Prop({ type: Types.ObjectId, ref: Workspace.name, required: true, index: true })
  workspaceId!: Types.ObjectId;

  @Prop({ required: true, trim: true, maxlength: 255 })
  title!: string;

  @Prop({ trim: true })
  public_id!: string;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  createdBy!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  updatedBy!: Types.ObjectId | null;

  @Prop({ type: Boolean, default: false, index: true })
  isDeleted!: boolean;

  @Prop({ type: Date, default: null })
  deletedAt!: Date | null;

  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  deletedBy!: Types.ObjectId | null;
}

export const DocumentSchema = SchemaFactory.createForClass(DocumentModel);

// Lấy danh sách Document của 1 Workspace (bỏ qua những cái đã xóa) theo thứ tự mới nhất
DocumentSchema.index({ workspaceId: 1, isDeleted: 1, created_at: -1 });