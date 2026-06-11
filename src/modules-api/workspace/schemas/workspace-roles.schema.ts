import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WorkspaceRoleDocument = HydratedDocument<WorkspaceRole>;

export enum WorkspaceRoleAction {
  VIEW = 'VIEW',
  EDIT = 'EDIT',
  DELETE = 'DELETE',
  INVITE = 'INVITE',
  REMOVE = 'REMOVE',
  COMMENT = 'COMMENT',
}

export enum WorkspaceRoleResource {
  WORKSPACE = 'WORKSPACE',
  MEMBER = 'MEMBER',
}

export class Permission {
  @Prop({
    required: true,
    enum: WorkspaceRoleAction,
  })
  action!: WorkspaceRoleAction;

  @Prop({
    required: true,
    enum: WorkspaceRoleResource,
  })
  resource!: WorkspaceRoleResource;
}

@Schema({
  collection: 'workspace_roles',
  timestamps: false,
  versionKey: false,
})
export class WorkspaceRole {
  @Prop({
    required: true,
    unique: true,
    trim: true,
    maxlength: 50,
  })
  name!: string;

  @Prop({
    trim: true,
  })
  description!: string;

  @Prop({
    type: [{ 
        action: { type: String, enum: Object.values(WorkspaceRoleAction) }, 
        resource: { type: String, enum: Object.values(WorkspaceRoleResource) },
        _id: false
    }],
    required: true,
    validate: {
      validator: (arr: Permission[]) => arr.length >= 1,
      message: 'Permissions must have at least 1 item',
    },
  })
  permissions!: Permission[];
}

export const WorkspaceRoleSchema = SchemaFactory.createForClass(WorkspaceRole);