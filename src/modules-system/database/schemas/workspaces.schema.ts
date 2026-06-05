import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from 'src/common/decorators/user.decorator';

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

  @Prop({ default: false })
  isDeleted: boolean;

  @Prop({ type: Date, default: null })
  deletedAt: Date | null;

  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  deletedBy: Types.ObjectId | null;
}

export const WorkspaceSchema = SchemaFactory.createForClass(Workspace);

// Index
WorkspaceSchema.index({ name: 1 });
WorkspaceSchema.index({ created_at: -1 });