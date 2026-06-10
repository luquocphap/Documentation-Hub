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

@Controller('document')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Get()
  findAll(
    @Query('workspaceId', ParseMongoIdPipe) workspaceId: string,
  ) {
    return this.documentService.findAll(workspaceId);
  }

  @Post()
  create(
    @Body() createDocumentDto: CreateDocumentDto,
    @CurrentUser() user: UserDocument
  ) {
    return this.documentService.create(createDocumentDto, user);
  }

  @Get(':documentId/my-role')
  getMyRole(
    @Param('documentId', ParseMongoIdPipe) documentId: string,
    @CurrentUser() user: UserDocument
  ) {
    return this.documentService.getMyRole(documentId, user);
  }

  @Post(':documentId')
  @Permissions("EDIT", "DOCUMENT")
  @UseInterceptors(FileInterceptor('document_file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Document File',
    type: DocumentUploadDto,
  })
  uploadFile(
    @Param('documentId', ParseMongoIdPipe) documentId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 20 * 1024 * 1024 }), // 20MB
          new FileTypeValidator({ fileType: 'application/pdf' }), // Chỉ nhận PDF
        ],
      }),
    ) file: Express.Multer.File,
    @CurrentUser() user: UserDocument
  ) {
    return this.documentService.uploadFile(documentId, file, user);
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