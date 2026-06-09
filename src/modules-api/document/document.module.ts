import { Module } from '@nestjs/common';
import { DocumentService } from './document.service';
import { DocumentController } from './document.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Workspace, WorkspaceSchema } from '../workspace/schemas/workspaces.schema';
import { DocumentModel, DocumentSchema } from './schemas/documents.schema';
import { CloudinaryModule } from 'src/modules-system/cloudinary/cloudinary.module';
import { DocumentMember, DocumentMemberSchema } from './schemas/document-members.schema';
import { DocumentRole, DocumentRoleSchema } from './schemas/document-roles.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Workspace.name, schema: WorkspaceSchema },
      { name: DocumentModel.name, schema: DocumentSchema },
      { name: DocumentMember.name, schema: DocumentMemberSchema },
      { name: DocumentRole.name, schema: DocumentRoleSchema },
    ]),
    CloudinaryModule,
  ],
  controllers: [DocumentController],
  providers: [DocumentService],
})
export class DocumentModule {}
