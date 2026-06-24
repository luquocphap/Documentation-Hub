import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
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
import { InviteDocumentMemberDto } from './dto/invite-document-member.dto';
import { ChangeDocumentRoleDto } from './dto/change-document-role.dto';

@Controller('document')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  @Get('/roles')
  getRoles() {
    return this.documentService.getRoles();
  }

  @Get()
  @Permissions('VIEW', 'WORKSPACE')
  findAll(@Query('workspaceId', ParseMongoIdPipe) workspaceId: string) {
    return this.documentService.findAll(workspaceId);
  }

  @Post('from-markdown')
  @Permissions('VIEW', 'WORKSPACE')
  createFromMarkdown(
    @Body() dto: CreateDocumentMarkdownDto,
    @CurrentUser() user: UserDocument,
  ) {
    return this.documentService.createFromMarkdown(dto, user);
  }

  @Post()
  @Permissions('VIEW', 'WORKSPACE')
  create(
    @Body() createDocumentDto: CreateDocumentDto,
    @CurrentUser() user: UserDocument,
  ) {
    return this.documentService.create(createDocumentDto, user);
  }

  @Post('webhook/cloudinary')
  @Public()
  handleCloudinaryWebhook(@Body() body: any) {
    return this.documentService.handleCloudinaryWebhook(body);
  }

  @Get(':documentId/upload-signature')
  @Permissions('EDIT', 'DOCUMENT')
  getUploadSignature(
    @Param('documentId', ParseMongoIdPipe) documentId: string,
    @CurrentUser() user: UserDocument,
  ) {
    return this.documentService.getUploadSignature(documentId, user);
  }

  @Get(':documentId/my-role')
  getMyRole(
    @Param('documentId', ParseMongoIdPipe) documentId: string,
    @CurrentUser() user: UserDocument,
  ) {
    return this.documentService.getMyRole(documentId, user);
  }

  @Post(':documentId/invite')
  @Permissions('MANAGE_ACCESS', 'DOCUMENT')
  inviteMember(
    @Param('documentId', ParseMongoIdPipe) documentId: string,
    @Body() dto: InviteDocumentMemberDto,
    @CurrentUser() user: UserDocument,
  ) {
    return this.documentService.inviteMember(documentId, dto, user);
  }

  @Get(':documentId/external-members')
  @Permissions('VIEW', 'DOCUMENT')
  async getExternalMembers(
    @Param('documentId', ParseMongoIdPipe) documentId: string,
  ) {
    return this.documentService.getExternalMembers(documentId);
  }

  @Delete(':documentId/external-members/:userId')
  @Permissions('MANAGE_ACCESS', 'DOCUMENT')
  async removeExternalMember(
    @Param('documentId', ParseMongoIdPipe) documentId: string,
    @Param('userId', ParseMongoIdPipe) userId: string,
    @CurrentUser() user: UserDocument,
  ) {
    return this.documentService.removeExternalMember(documentId, userId, user);
  }

  @Patch(':documentId/change-role')
  @Permissions('MANAGE_ACCESS', 'DOCUMENT')
  async changeMemberRole(
    @Param('documentId', ParseMongoIdPipe) documentId: string,
    @Body() dto: ChangeDocumentRoleDto,
  ) {
    return this.documentService.changeMemberRole(documentId, dto);
  }

  @Get(':documentId')
  @Permissions('VIEW', 'DOCUMENT')
  findOne(@Param('documentId', ParseMongoIdPipe) documentId: string) {
    return this.documentService.findOne(documentId);
  }

  @Patch(':documentId')
  @Permissions('EDIT', 'DOCUMENT')
  update(
    @Param('documentId', ParseMongoIdPipe) documentId: string,
    @Body() updateDocumentDto: UpdateDocumentDto,
    @CurrentUser() user: UserDocument,
  ) {
    return this.documentService.update(documentId, updateDocumentDto, user);
  }

  @Delete(':documentId')
  @Permissions('DELETE', 'DOCUMENT')
  remove(
    @Param('documentId', ParseMongoIdPipe) documentId: string,
    @CurrentUser() user: UserDocument,
  ) {
    return this.documentService.remove(documentId, user);
  }
}
