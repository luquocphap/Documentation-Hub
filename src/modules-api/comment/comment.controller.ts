import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiParam } from '@nestjs/swagger';
import { User as CurrentUser } from 'src/common/decorators/user.decorator';
import { ParseMongoIdPipe } from 'src/common/pipes/parse-mongo-id.pipe';
import { type UserDocument } from '../auth/schemas/user.schema';
import { CreateDocumentCommentDto } from './dto/create-document-comment.dto';
import {
  CreateCommentReplyDto,
  UpdateCommentReplyDto,
} from './dto/comment-reply.dto';
import { UpdateDocumentCommentDto } from './dto/update-document-comment.dto';
import { CommentService } from './comment.service';

@Controller('comment')
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

  @Post(':id/reply')
  @ApiOperation({ summary: 'Create a reply for a root comment' })
  @ApiParam({ name: 'id', description: 'Root comment ID' })
  async createReply(
    @Param('id', ParseMongoIdPipe) commentId: string,
    @Body() createReplyDto: CreateCommentReplyDto,
    @CurrentUser() user: UserDocument,
  ) {
    return this.commentService.createReply(commentId, user, createReplyDto);
  }

  @Get(':id/replies')
  @ApiOperation({ summary: 'Get replies of a root comment' })
  @ApiParam({ name: 'id', description: 'Root comment ID' })
  async getReplies(@Param('id', ParseMongoIdPipe) commentId: string) {
    return this.commentService.findRepliesByComment(commentId);
  }

  @Patch(':commentId/reply/:replyId')
  @ApiOperation({ summary: 'Update a reply' })
  @ApiParam({ name: 'commentId', description: 'Root comment ID' })
  @ApiParam({ name: 'replyId', description: 'Reply ID' })
  async updateReply(
    @Param('commentId', ParseMongoIdPipe) commentId: string,
    @Param('replyId', ParseMongoIdPipe) replyId: string,
    @Body() updateReplyDto: UpdateCommentReplyDto,
    @CurrentUser() user: UserDocument,
  ) {
    return this.commentService.updateReply(
      commentId,
      replyId,
      user,
      updateReplyDto,
    );
  }

  @Delete(':commentId/reply/:replyId')
  @ApiOperation({ summary: 'Soft delete a reply' })
  @ApiParam({ name: 'commentId', description: 'Root comment ID' })
  @ApiParam({ name: 'replyId', description: 'Reply ID' })
  async deleteReply(
    @Param('commentId', ParseMongoIdPipe) commentId: string,
    @Param('replyId', ParseMongoIdPipe) replyId: string,
    @CurrentUser() user: UserDocument,
  ) {
    return this.commentService.removeReply(commentId, replyId, user);
  }

  @Get(':documentId')
  @ApiOperation({ summary: 'Get comments by document' })
  @ApiParam({ name: 'documentId', description: 'Document ID' })
  async getCommentsByDocument(
    @Param('documentId', ParseMongoIdPipe) documentId: string,
  ) {
    return this.commentService.findAllByDocument(documentId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a comment' })
  async createComment(
    @Body('documentId', ParseMongoIdPipe) documentId: string,
    @Body() createDto: CreateDocumentCommentDto,
    @CurrentUser() user: UserDocument,
  ) {
    return this.commentService.create(user, documentId, createDto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a comment' })
  @ApiParam({ name: 'id', description: 'Comment ID' })
  async updateComment(
    @Param('id', ParseMongoIdPipe) commentId: string,
    @Body() updateDto: UpdateDocumentCommentDto,
    @CurrentUser() user: UserDocument,
  ) {
    return this.commentService.update(commentId, user, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete a comment' })
  @ApiParam({ name: 'id', description: 'Comment ID' })
  async deleteComment(
    @Param('id', ParseMongoIdPipe) commentId: string,
    @CurrentUser() user: UserDocument,
  ) {
    return this.commentService.remove(commentId, user);
  }
}
