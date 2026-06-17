import { Type } from "@nestjs/common";
import { Prop, Schema } from "@nestjs/mongoose";
import { Types } from "mongoose";
import { User } from "src/modules-api/auth/schemas/user.schema";
import { Action } from "./actions.schema";

@Schema({
    collection: 'activities',
    timestamps: { createdAt: 'created_at' },
    versionKey: false
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
        ref: Action.name,
        required: true,
    })
    actionId!: Types.ObjectId;
}