import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({
  collection: 'User',
  timestamps: true,
  versionKey: false,
  toJSON: {
    virtuals: true,
    transform: (_doc, ret) => {
      const transformed = ret as Record<string, any>;
      transformed.id = transformed._id.toString();
      delete transformed._id;
      delete transformed.passwordHash;
      return ret;
    },
  },
})
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true, index: true })
  email!: string;

  @Prop({ required: true, select: false })
  passwordHash!: string;

  @Prop({ required: true, trim: true })
  fullName!: string;

  @Prop({ default: false })
  isEmailVerified!: boolean;

  @Prop({ type: Types.ObjectId, default: null })
  lastAccessedWorkspaceId?: Types.ObjectId;
}

export const UserSchema = SchemaFactory.createForClass(User);
