import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  DocumentComment,
  DocumentCommentSchema,
} from './schemas/document-comments.schema';
import {
  DocumentAnnotation,
  DocumentAnnotationSchema,
} from './schemas/document-annotations.schema';
import { CommentService } from './document.service';
import { CommentController } from './document.controller';
import {
  CommentReply,
  CommentReplySchema,
} from './schemas/comment-replies.schema';
import { SocketModule } from 'src/modules-system/socket/socket.module';

@Module({
  imports: [
    SocketModule,
    MongooseModule.forFeature([
      { name: DocumentComment.name, schema: DocumentCommentSchema },
      { name: DocumentAnnotation.name, schema: DocumentAnnotationSchema },
      { name: CommentReply.name, schema: CommentReplySchema },
    ]),
  ],
  controllers: [CommentController],
  providers: [CommentService],
})
export class CommentModule {}
