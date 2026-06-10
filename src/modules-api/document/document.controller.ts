import { 
  Controller, Get, Post, Body, Patch, Param, Delete, 
  Query, UseInterceptors, UploadedFile, ParseFilePipe, 
  MaxFileSizeValidator, FileTypeValidator 
} from '@nestjs/common';
import { DocumentService } from './document.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { User as CurrentUser } from 'src/common/decorators/user.decorator';
import { type UserDocument } from '../auth/schemas/user.schema';
import { FileInterceptor } from '@nestjs/platform-express';
import { Permissions } from 'src/common/decorators/permission.decorator';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';
import { DocumentUploadDto } from './dto/document-upload.dto';
import { ParseMongoIdPipe } from 'src/common/pipes/parse-mongo-id.pipe';
import { Public } from 'src/common/decorators/public.decorator';
import { CreateDocumentMarkdownDto } from './dto/create-document-markdown.dto';

@Controller('document')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Get()
  findAll(
    @Query('workspaceId', ParseMongoIdPipe) workspaceId: string,
  ) {
    return this.documentService.findAll(workspaceId);
  }

  @Post('from-markdown')
  createFromMarkdown(
    @Body() dto: CreateDocumentMarkdownDto,
    @CurrentUser() user: UserDocument
  ) {
    return this.documentService.createFromMarkdown(dto, user);
  }

  @Post()
  create(
    @Body() createDocumentDto: CreateDocumentDto,
    @CurrentUser() user: UserDocument
  ) {
    return this.documentService.create(createDocumentDto, user);
  }

  @Post('webhook/cloudinary')
  @Public()
  handleCloudinaryWebhook(@Body() body: any) {
    return this.documentService.handleCloudinaryWebhook(body);
  }

  @Get(':documentId/upload-signature')
  @Permissions("EDIT", "DOCUMENT")
  getUploadSignature(
    @Param('documentId', ParseMongoIdPipe) documentId: string,
    @CurrentUser() user: UserDocument
  ) {
    return this.documentService.getUploadSignature(documentId, user);
  }

  @Get(':documentId/my-role')
  getMyRole(
    @Param('documentId', ParseMongoIdPipe) documentId: string,
    @CurrentUser() user: UserDocument
  ) {
    return this.documentService.getMyRole(documentId, user);
  }

  @Patch(':documentId')
  @Permissions("EDIT", "DOCUMENT")
  update(
    @Param('documentId', ParseMongoIdPipe) documentId: string, 
    @Body() updateDocumentDto: UpdateDocumentDto,
    @CurrentUser() user: UserDocument
  ) {
    return this.documentService.update(documentId, updateDocumentDto, user);
  }

  @Delete(':documentId')
  @Permissions("DELETE", "DOCUMENT")
  remove(
    @Param('documentId', ParseMongoIdPipe) documentId: string,
    @CurrentUser() user: UserDocument
  ) {
    return this.documentService.remove(documentId, user);
  }
}