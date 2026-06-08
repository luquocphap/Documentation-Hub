import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { User as CurrentUser } from 'src/common/decorators/user.decorator';
import { Permissions } from 'src/common/decorators/permission.decorator';
import { InviteMemberDto } from './dto/invite-memer.dto';
import type { UserDocument } from '../auth/schemas/user.schema';

@Controller('workspace')
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Post()
  create(@Body() createWorkspaceDto: CreateWorkspaceDto, @CurrentUser() user: UserDocument) {
    return this.workspaceService.create(createWorkspaceDto, user);
  }

  @Get()
  async findAll(@CurrentUser() user: UserDocument) {
    return this.workspaceService.findAll(user);
  }

  @Get(':workspaceId')
  @Permissions('VIEW', 'WORKSPACE')
  findOne(@Param('workspaceId') workspaceId: string, @CurrentUser() user: UserDocument) {
    return this.workspaceService.findOne(workspaceId, user);
  }

  @Patch(':workspaceId')
  @Permissions("EDIT", "WORKSPACE")
  update(@Param('workspaceId') id: string, @Body() updateWorkspaceDto: UpdateWorkspaceDto) {
    return this.workspaceService.update(id, updateWorkspaceDto);
  }

  @Delete(':workspaceId')
  @Permissions("DELETE", "WORKSPACE")
  remove(@Param('workspaceId') id: string, @CurrentUser() user: UserDocument) {
    return this.workspaceService.remove(id, user); 
  }

  @Post(':workspaceId/invite')
  @Permissions("INVITE", "MEMBER")
  inviteMember(
    @Param('workspaceId') workspaceId: string,
    @Body() inviteMemberDto: InviteMemberDto,
    @CurrentUser() user: UserDocument
  ) {
    return this.workspaceService.inviteMember(workspaceId, inviteMemberDto, user);
  }
}
