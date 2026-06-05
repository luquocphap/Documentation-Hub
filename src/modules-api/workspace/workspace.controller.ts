import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';
import { CreateWorkspaceDto } from './dto/create-workspace.dto';
import { UpdateWorkspaceDto } from './dto/update-workspace.dto';
import { User as CurrentUser } from 'src/common/decorators/user.decorator';
import type { UserDocument } from 'src/modules-system/database/schemas/user.schema';
import { Permissions } from 'src/common/decorators/permission.decorator';

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
}
