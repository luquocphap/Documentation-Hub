import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Workspace } from './workspace.schema';
import { Role } from './role.schema';

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
  workspaceId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',           // ref string để tránh circular dependency với User module
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: Role.name,
    required: true,
  })
  roleId: Types.ObjectId;

  @Prop({
    required: true,
    default: () => new Date(),
  })
  joinedAt: Date;
}

export const WorkspaceMemberSchema = SchemaFactory.createForClass(WorkspaceMember);

// Index
WorkspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });
WorkspaceMemberSchema.index({ userId: 1 });
WorkspaceMemberSchema.index({ workspaceId: 1, roleId: 1 });