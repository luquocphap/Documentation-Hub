import { Controller, Get, Req } from '@nestjs/common';
import { ApiOperation, ApiQuery } from '@nestjs/swagger';
import { type Request } from 'express';
import { User as CurrentUser } from 'src/common/decorators/user.decorator';
import { type UserDocument } from '../auth/schemas/user.schema';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('document')
  @ApiOperation({ summary: 'Search accessible documents' })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search keyword matched against document title and content',
    example: 'contract',
  })
  @ApiQuery({
    name: 'workspaceIds',
    required: false,
    type: String,
    description: 'Comma-separated workspace IDs',
    example: '665f2a7b9cf01a2b3c4d5e61,665f2a7b9cf01a2b3c4d5e62',
  })
  @ApiQuery({
    name: 'updatedFrom',
    required: false,
    type: String,
    description: 'Filter documents updated from this date',
    example: '2026-06-01',
  })
  @ApiQuery({
    name: 'updatedTo',
    required: false,
    type: String,
    description: 'Filter documents updated to this date',
    example: '2026-06-16',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number, minimum 1',
    example: 1,
  })
  @ApiQuery({
    name: 'pageSize',
    required: false,
    type: Number,
    description: 'Page size, maximum 50',
    example: 10,
  })
  searchDocuments(@Req() req: Request, @CurrentUser() user: UserDocument) {
    return this.searchService.searchDocuments(req, user);
  }
}
