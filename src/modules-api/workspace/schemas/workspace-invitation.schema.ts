import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Workspace } from './workspaces.schema';
import { WorkspaceRole } from './workspace-roles.schema';
import { User } from 'src/modules-api/auth/schemas/user.schema';


export type WorkspaceInvitationDocument = HydratedDocument<WorkspaceInvitation>;

export enum InvitationStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  EXPIRED = 'EXPIRED',
}

@Schema({
  collection: 'workspace_invitations',
  timestamps: { createdAt: 'invitedAt', updatedAt: false }, // Chỉ cần lưu ngày mời
  versionKey: false,
})
export class WorkspaceInvitation {
  @Prop({ 
    required: true, 
    lowercase: true, 
    trim: true, 
    index: true 
  })
  email!: string;

  @Prop({
    type: Types.ObjectId,
    ref: Workspace.name,
    required: true,
  })
  workspaceId!: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: WorkspaceRole.name,
    required: true,
  })
  roleId!: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: User.name,
    required: true,
  })
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
    // Mặc định lời mời có hiệu lực trong 7 ngày
    default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), 
    index: true,
  })
  expiresAt!: Date;
}

export const WorkspaceInvitationSchema = SchemaFactory.createForClass(WorkspaceInvitation);

// Compound Index: Ngăn chặn việc gửi trùng lời mời PENDING cho cùng 1 email vào cùng 1 workspace
WorkspaceInvitationSchema.index({ email: 1, workspaceId: 1, status: 1 });