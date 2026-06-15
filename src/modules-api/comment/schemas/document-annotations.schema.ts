import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from 'src/modules-api/auth/schemas/user.schema';
import { DocumentModel } from 'src/modules-api/document/schemas/documents.schema';

export type DocumentAnnotationDocument = HydratedDocument<DocumentAnnotation>;

@Schema({
  collection: 'document_annotations',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  versionKey: false,
})
export class DocumentAnnotation {
  @Prop({
    type: Types.ObjectId,
    ref: DocumentModel.name,
    required: true,
    index: true,
  })
  documentId!: Types.ObjectId;

  @Prop({ required: true, trim: true, index: true })
  annotationId!: string;

  @Prop({ required: true, trim: true })
  type!: string;

  @Prop({ type: Number, required: true, min: 1, index: true })
  pageNumber!: number;

  @Prop({ type: [Object], default: [] })
  quads!: Record<string, any>[];

  @Prop({ type: Object, default: null })
  rect!: Record<string, any> | null;

  @Prop({ type: String, trim: true, default: '' })
  contents!: string;

  @Prop({ type: String, trim: true, default: '#FFEB3B' })
  color!: string;

  @Prop({ type: Number, min: 0, max: 1, default: 1 })
  opacity!: number;

  @Prop({ type: String, default: null })
  xfdf!: string | null;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true })
  createdBy!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  updatedBy!: Types.ObjectId | null;

  @Prop({ type: Boolean, default: false, index: true })
  isDeleted!: boolean;

  @Prop({ type: Date, default: null })
  deletedAt!: Date | null;

  @Prop({ type: Types.ObjectId, ref: User.name, default: null })
  deletedBy!: Types.ObjectId | null;
}

export const DocumentAnnotationSchema =
  SchemaFactory.createForClass(DocumentAnnotation);

DocumentAnnotationSchema.index(
  { documentId: 1, annotationId: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);
DocumentAnnotationSchema.index({ documentId: 1, pageNumber: 1, isDeleted: 1 });
