import { 
  Controller, Get, Post, Patch, Delete, 
  Param, Body, Req 
} from '@nestjs/common';
import { ApiOperation, ApiParam } from '@nestjs/swagger';
import { CreateDocumentCommentDto } from './dto/create-document-comment.dto';
import { UpdateDocumentCommentDto } from './dto/update-document-comment.dto';
import { CommentService } from './document.service';
import { User as CurrentUser } from 'src/common/decorators/user.decorator';
import { type UserDocument } from '../auth/schemas/user.schema';

@Controller('comment')
export class CommentController {
    constructor(private readonly commentService: CommentService) {}

    @Post(':id/reply')
    @ApiOperation({ summary: 'Tạo một reply phản hồi cho comment gốc' })
    @ApiParam({ name: 'id', description: 'ID của comment gốc' })
    async createReply(
        @Req() req: any,
        @Param('id') commentId: string,
        @Body('text') text: string,
        @CurrentUser() user: UserDocument
    ) {
        return this.commentService.createReply(commentId, user, text);
    }

    @Get(':id/replies')
    @ApiOperation({ summary: 'Lấy danh sách các replies của một comment' })
    @ApiParam({ name: 'id', description: 'ID của comment gốc' })
    async getReplies(@Param('id') commentId: string) {
        return this.commentService.findRepliesByComment(commentId);
    }

    @Get(':documentId')
    @ApiOperation({ summary: 'Lấy danh sách comment của một tài liệu' })
    @ApiParam({ name: 'documentId', description: 'ID của tài liệu' })
    async getCommentsByDocument(@Param('documentId') documentId: string) {
        return this.commentService.findAllByDocument(documentId);
    }

    @Post()
    @ApiOperation({ summary: 'Tạo mới một comment' })
    async createComment(
        @Req() req: any, 
        @Body('documentId') documentId: string,
        @Body() createDto: CreateDocumentCommentDto,
        @CurrentUser() user: UserDocument,
    ) {
        return this.commentService.create(user, documentId, createDto);
    }

    @Patch(':id')
    @ApiOperation({ summary: 'Cập nhật một comment' })
    @ApiParam({ name: 'id', description: 'ID của comment' })
    async updateComment(
        @Req() req: any,
        @Param('id') commentId: string,
        @Body() updateDto: UpdateDocumentCommentDto,
        @CurrentUser() user: UserDocument
    ) {
        return this.commentService.update(commentId, user, updateDto);
    }

    @Delete(':id')
    @ApiOperation({ summary: 'Xóa mềm một comment' })
    @ApiParam({ name: 'id', description: 'ID của comment' })
    async deleteComment(
        @Req() req: any,
        @Param('id') commentId: string,
        @CurrentUser() user: UserDocument,
    ) {
        return this.commentService.remove(commentId, user);
    }
}