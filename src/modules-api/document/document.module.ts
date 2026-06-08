import { Module } from '@nestjs/common';
import { DocumentService } from './document.service';
import { DocumentController } from './document.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Workspace, WorkspaceSchema } from '../workspace/schemas/workspaces.schema';
import { DocumentModel, DocumentSchema } from './schemas/documents.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Workspace.name, schema: WorkspaceSchema },
      { name: DocumentModel.name, schema: DocumentSchema },
    ])
  ],
  controllers: [DocumentController],
  providers: [DocumentService],
})
export class DocumentModule {}
