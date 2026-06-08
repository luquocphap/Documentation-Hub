import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type RoleDocument = HydratedDocument<Role>;

export enum RoleAction {
  VIEW = 'VIEW',
  EDIT = 'EDIT',
  DELETE = 'DELETE',
  INVITE = 'INVITE',
  REMOVE = 'REMOVE',
  COMMENT = 'COMMENT',
}

export enum RoleResource {
  WORKSPACE = 'WORKSPACE',
  MEMBER = 'MEMBER',
}

export class Permission {
  @Prop({
    required: true,
    enum: RoleAction,
  })
  action!: RoleAction;

  @Prop({
    required: true,
    enum: RoleResource,
  })
  resource!: RoleResource;
}

@Schema({
  collection: 'roles',
  timestamps: false,
  versionKey: false,
})
export class Role {
  @Prop({
    required: true,
    unique: true,
    trim: true,
    maxlength: 50,
  })
  name!: string;

  @Prop({
    type: [{ 
        action: { type: String, enum: Object.values(RoleAction) }, 
        resource: { type: String, enum: Object.values(RoleResource) },
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

export const RoleSchema = SchemaFactory.createForClass(Role);