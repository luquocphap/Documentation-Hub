import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from 'src/modules-api/auth/schemas/user.schema';
import { Workspace } from 'src/modules-api/workspace/schemas/workspaces.schema';
import { Action } from './actions.schema';

export type ActivityDocument = HydratedDocument<Activity>;

export enum ActivityTargetType {
  DOCUMENT = 'DOCUMENT',
  EMAIL = 'EMAIL',
  ROLE = 'ROLE',
}

@Schema({
  _id: false,
  versionKey: false,
})
export class ActivityTarget {
  @Prop({
    type: String,
    enum: Object.values(ActivityTargetType),
    required: true,
  })
  type!: ActivityTargetType;

  @Prop({
    type: String,
    required: true,
    trim: true,
    maxlength: 500,
  })
  value!: string;

  @Prop({
    type: Types.ObjectId,
    default: null,
  })
  entityId!: Types.ObjectId | null;
}

export const ActivityTargetSchema =
  SchemaFactory.createForClass(ActivityTarget);

@Schema({
  collection: 'activities',
  timestamps: { createdAt: 'created_at', updatedAt: false },
  versionKey: false,
})
export class Activity {
  @Prop({
    type: Types.ObjectId,
    required: true,
    ref: User.name,
  })
  actorId!: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    required: true,
    ref: Workspace.name,
    index: true,
  })
  workspaceId!: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: Action.name,
    required: true,
  })
  actionId!: Types.ObjectId;

  @Prop({
    type: [ActivityTargetSchema],
    default: [],
    validate: {
      validator: (targets: ActivityTarget[]) => targets.length <= 2,
      message: 'Activity cannot contain more than 2 targets',
    },
  })
  targets!: ActivityTarget[];
}

export const ActivitySchema = SchemaFactory.createForClass(Activity);

ActivitySchema.index({ workspaceId: 1, created_at: -1 });
ActivitySchema.index({ workspaceId: 1, actorId: 1, created_at: -1 });
ActivitySchema.index({ workspaceId: 1, actionId: 1, created_at: -1 });
