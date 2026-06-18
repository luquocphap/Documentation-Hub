import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { ActivityLogAction } from 'src/common/events/activity-log.event';

export type ActionDocument = HydratedDocument<Action>;

@Schema({
  collection: 'actions',
  versionKey: false,
})
export class Action {
  @Prop({
    type: String,
    enum: Object.values(ActivityLogAction),
    required: true,
  })
  code!: ActivityLogAction;

  @Prop({
    type: String,
    required: true,
  })
  action!: string;

  @Prop({
    type: Types.ObjectId,
    required: true,
  })
  categoryId!: Types.ObjectId;
}

export const ActionSchema = SchemaFactory.createForClass(Action);

ActionSchema.index(
  { code: 1 },
  {
    unique: true,
    partialFilterExpression: {
      code: { $type: 'string' },
    },
  },
);
