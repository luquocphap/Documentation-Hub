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
import { WorkspaceService } from './workspace.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { User as CurrentUser } from 'src/common/decorators/user.decorator';
import { Permissions } from 'src/common/decorators/permission.decorator';
import type { UserDocument } from '../auth/schemas/user.schema';
import { ChangeRoleDto } from './dto/change-role.dto';
import { ParseMongoIdPipe } from 'src/common/pipes/parse-mongo-id.pipe';
import { InviteMemberDto } from './dto/invite-memer.dto';

@Controller('workspace')
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  @Get('/roles')
  async getWorkspaceRoles() {
    return this.workspaceService.getWorkspaceRoles();
  }

  @Post()
  create(
    @Body() createWorkspaceDto: CreateWorkspaceDto,
    @CurrentUser() user: UserDocument,
  ) {
    return this.workspaceService.create(createWorkspaceDto, user);
  }

  @Get()
  async findAll(@CurrentUser() user: UserDocument) {
    return this.workspaceService.findAll(user);
  }

  @Get(':workspaceId/members')
  @Permissions('VIEW', 'WORKSPACE')
  async getMembers(@Param('workspaceId') workspaceId: string) {
    return this.workspaceService.getMembers(workspaceId);
  }

  @Delete(':workspaceId/members/:userId')
  @Permissions('EDIT', 'WORKSPACE')
  async removeMember(
    @Param('workspaceId') workspaceId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: UserDocument,
  ) {
    return this.workspaceService.removeMember(workspaceId, userId, user);
  }

  @Post(':workspaceId/change-role')
  @Permissions('EDIT', 'WORKSPACE')
  async changeMemberRole(
    @Param('workspaceId') workspaceId: string,
    @Body() changeRoleDto: ChangeRoleDto,
    @CurrentUser() user: UserDocument,
  ) {
    return this.workspaceService.changeMemberRole(
      workspaceId,
      changeRoleDto,
      user,
    );
  }

  @Get(':workspaceId')
  @Permissions('VIEW', 'WORKSPACE')
  findOne(
    @Param('workspaceId', ParseMongoIdPipe) workspaceId: string,
    @CurrentUser() user: UserDocument,
  ) {
    return this.workspaceService.findOne(workspaceId, user);
  }

  @Patch(':workspaceId')
  @Permissions('EDIT', 'WORKSPACE')
  update(
    @Param('workspaceId') id: string,
    @Body() updateWorkspaceDto: UpdateWorkspaceDto,
    @CurrentUser() user: UserDocument,
  ) {
    return this.workspaceService.update(id, updateWorkspaceDto, user);
  }

  @Delete(':workspaceId')
  @Permissions('DELETE', 'WORKSPACE')
  remove(@Param('workspaceId') id: string, @CurrentUser() user: UserDocument) {
    return this.workspaceService.remove(id, user);
  }

  @Post(':workspaceId/invite')
  @Permissions('INVITE', 'MEMBER')
  inviteMember(
    @Param('workspaceId') workspaceId: string,
    @Body() inviteMemberDto: InviteMemberDto,
    @CurrentUser() user: UserDocument,
  ) {
    return this.workspaceService.inviteMember(
      workspaceId,
      inviteMemberDto,
      user,
    );
  }
}
