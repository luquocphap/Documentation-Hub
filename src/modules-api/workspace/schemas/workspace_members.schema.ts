import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Workspace } from './workspaces.schema';
import { WorkspaceRole } from './workspace-roles.schema';
import { User } from 'src/modules-api/auth/schemas/user.schema';

export type WorkspaceMemberDocument = HydratedDocument<WorkspaceMember>;

@Schema({
  collection: 'workspace_members',
  timestamps: false,
  versionKey: false,
})
export class WorkspaceMember {
  @Prop({
    type: Types.ObjectId,
    ref: Workspace.name,
    required: true,
    index: true,
  })
  workspaceId!: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: User.name,
    required: true,
  })
  userId!: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: WorkspaceRole.name,
    required: true,
  })
  roleId!: Types.ObjectId;

  @Prop({
    required: true,
    default: () => new Date(),
  })
  joinedAt!: Date;

  @Prop({ required: true, trim: true, maxlength: 60 })
  workspaceName!: string;

  @Prop({ type: String, required: false, trim: true, maxlength: 255, default: null })
  workspaceDescription!: string | null;

  @Prop({ default: false })
  isDeleted!: boolean;

  @Prop({ type: Date, default: null })
  deletedAt!: Date | null;

  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  deletedBy!: Types.ObjectId | null;
}

export const WorkspaceMemberSchema = SchemaFactory.createForClass(WorkspaceMember);

// Index 
WorkspaceMemberSchema.index(
  { workspaceId: 1, userId: 1 }, 
  { unique: true, partialFilterExpression: { isDeleted: false } }
);
// Tối ưu hóa cho hàm gọi Dashboard: Tìm member của 1 user và chưa bị xóa
WorkspaceMemberSchema.index({ userId: 1, isDeleted: 1 });
WorkspaceMemberSchema.index({ workspaceId: 1, roleId: 1 });