import { Controller, Get, Param, Req } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { type Request } from 'express';
import { Permissions } from 'src/common/decorators/permission.decorator';
import { ParseMongoIdPipe } from 'src/common/pipes/parse-mongo-id.pipe';
import { ActivityService } from './activity.service';

@Controller('activity')
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get('actions')
  @ApiOperation({ summary: 'Get all activity actions grouped by category' })
  getActivityActions() {
    return this.activityService.getActivityActions();
  }

  @Get(':workspaceId/actors')
  @Permissions('VIEW', 'WORKSPACE')
  @ApiOperation({ summary: 'Get actors who have activity in a workspace' })
  @ApiParam({
    name: 'workspaceId',
    required: true,
    type: String,
    description: 'Workspace containing the activity logs',
    example: '6a265b01c2eb2822d45cf532',
  })
  getActivityActors(
    @Param('workspaceId', ParseMongoIdPipe) workspaceId: string,
  ) {
    return this.activityService.getActivityActors(workspaceId);
  }

  @Get(':workspaceId')
  @Permissions('VIEW', 'WORKSPACE')
  @ApiOperation({ summary: 'Get activity logs' })
  @ApiParam({
    name: 'workspaceId',
    required: true,
    type: String,
    description: 'Search activity in Workspace',
    example: '6a265b01c2eb2822d45cf532',
  })
  @ApiQuery({
    name: 'actorIds',
    required: false,
    type: String,
    description: 'Comma-separated actor user IDs',
    example: '665f2a7b9cf01a2b3c4d5e71,665f2a7b9cf01a2b3c4d5e72',
  })
  @ApiQuery({
    name: 'actionIds',
    required: false,
    type: String,
    description: 'Comma-separated action IDs',
    example: '333333333333333333333001,333333333333333333333002',
  })
  @ApiQuery({
    name: 'createdFrom',
    required: false,
    type: String,
    description: 'Filter activities created from this date',
    example: '2026-06-01',
  })
  @ApiQuery({
    name: 'createdTo',
    required: false,
    type: String,
    description: 'Filter activities created to this date',
    example: '2026-06-17',
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
  getActivityLogs(
    @Param('workspaceId', ParseMongoIdPipe) workspaceId: string,
    @Req() req: Request,
  ) {
    return this.activityService.getActivityLogs(workspaceId, req);
  }
}
