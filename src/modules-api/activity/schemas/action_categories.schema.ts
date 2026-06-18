import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ActionCategoryDocument = HydratedDocument<ActionCategory>;

@Schema({
  collection: 'action_categories',
  versionKey: false,
})
export class ActionCategory {
  @Prop({
    type: String,
    required: true,
    trim: true,
  })
  name!: string;
}

export const ActionCategorySchema =
  SchemaFactory.createForClass(ActionCategory);
