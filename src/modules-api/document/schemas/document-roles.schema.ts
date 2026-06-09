import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type DocumentRoleDocument = HydratedDocument<DocumentRole>;

export enum DocumentRoleAction {
  VIEW = 'VIEW',
  EDIT = 'EDIT',
  DELETE = 'DELETE',
  SHARE = 'SHARE',
  COMMENT = 'COMMENT',
  MANAGE_ACCESS = 'MANAGE_ACCESS'
}

export enum DocumentRoleResource {
  DOCUMENT = 'DOCUMENT',
}

export class DocumentPermission {
  @Prop({ required: true, enum: DocumentRoleAction })
  action!: DocumentRoleAction;

  @Prop({ required: true, enum: DocumentRoleResource })
  resource!: DocumentRoleResource;
}

@Schema({
  collection: 'document_roles',
  timestamps: false,
  versionKey: false,
})
export class DocumentRole {
  @Prop({ required: true, unique: true, trim: true, maxlength: 50 })
  name!: string;

  @Prop({ trim: true })
  description!: string;

  @Prop({
    type: [{ 
        action: { type: String, enum: Object.values(DocumentRoleAction) }, 
        resource: { type: String, enum: Object.values(DocumentRoleResource) },
        _id: false
    }],
    required: true,
  })
  permissions!: DocumentPermission[];
}

export const DocumentRoleSchema = SchemaFactory.createForClass(DocumentRole);