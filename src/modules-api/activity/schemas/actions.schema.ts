import { Prop, Schema } from "@nestjs/mongoose";

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
}