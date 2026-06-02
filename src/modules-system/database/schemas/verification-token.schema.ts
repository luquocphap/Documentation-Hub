import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from './user.schema';

export type VerificationTokenDocument = HydratedDocument<VerificationToken>;

@Schema({
  collection: 'VerificationToken',
  timestamps: { createdAt: true, updatedAt: false },
  versionKey: false,
})
export class VerificationToken {
  @Prop({ required: true, unique: true, index: true })
  token: string;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ default: false })
  isUsed: boolean;

  @Prop({ default: true })
  isValid: boolean;
}

export const VerificationTokenSchema = SchemaFactory.createForClass(VerificationToken);