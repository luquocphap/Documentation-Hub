import { Module } from '@nestjs/common';
import { DocumentService } from './document.service';
import { DocumentController } from './document.controller';
import { MongooseModule } from '@nestjs/mongoose';
import {
  Workspace,
  WorkspaceSchema,
} from '../workspace/schemas/workspaces.schema';
import { DocumentModel, DocumentSchema } from './schemas/documents.schema';
import { CloudinaryModule } from 'src/modules-system/cloudinary/cloudinary.module';
import { DocumentParserModule } from 'src/modules-system/document-parser/document-parser.module';
import {
  DocumentMember,
  DocumentMemberSchema,
} from './schemas/document-members.schema';
import {
  DocumentRole,
  DocumentRoleSchema,
} from './schemas/document-roles.schema';
import {
  WorkspaceMember,
  WorkspaceMemberSchema,
} from '../workspace/schemas/workspace_members.schema';
import {
  DocumentInvitation,
  DocumentInvitationSchema,
} from './schemas/document-invitation.schemas';
import { User, UserSchema } from '../auth/schemas/user.schema';
import {
  DocumentComment,
  DocumentCommentSchema,
} from '../comment/schemas/document-comments.schema';
import {
  DocumentAnnotation,
  DocumentAnnotationSchema,
} from '../comment/schemas/document-annotations.schema';
import {
  CommentReply,
  CommentReplySchema,
} from '../comment/schemas/comment-replies.schema';
import { DocumentPurgeService } from './document-purge.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Workspace.name, schema: WorkspaceSchema },
      { name: DocumentModel.name, schema: DocumentSchema },
      { name: DocumentMember.name, schema: DocumentMemberSchema },
      { name: DocumentRole.name, schema: DocumentRoleSchema },
      { name: WorkspaceMember.name, schema: WorkspaceMemberSchema },
      { name: DocumentInvitation.name, schema: DocumentInvitationSchema },
      { name: User.name, schema: UserSchema },
      { name: DocumentComment.name, schema: DocumentCommentSchema },
      { name: DocumentAnnotation.name, schema: DocumentAnnotationSchema },
      { name: CommentReply.name, schema: CommentReplySchema },
    ]),
    CloudinaryModule,
    DocumentParserModule,
  ],
  controllers: [DocumentController],
  providers: [DocumentService, DocumentPurgeService],
  exports: [DocumentPurgeService],
})
export class DocumentModule {}
