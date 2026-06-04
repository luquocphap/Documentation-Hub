import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WorkspaceDocument = HydratedDocument<Workspace>;

@Schema({
  collection: 'workspaces',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  versionKey: false,
})
export class Workspace {
  @Prop({
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 60,
  })
  name: string;

  @Prop({
    type: String,
    required: false,
    trim: true,
    maxlength: 255,
    default: null,
  })
  description: string | null;

  @Prop({
    type: Number,
    default: 0,
    min: 0,
  })
  memberCount: number;
}

export const WorkspaceSchema = SchemaFactory.createForClass(Workspace);

// Index
WorkspaceSchema.index({ name: 1 });
WorkspaceSchema.index({ created_at: -1 });