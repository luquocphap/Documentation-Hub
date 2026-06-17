import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import { HydratedDocument, Types } from "mongoose";

export type ActionDocument = HydratedDocument<Action>;

@Schema({
    collection: 'actions',
    versionKey: false
})
export class Action {
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

export const ActionSchema =
  SchemaFactory.createForClass(Action);