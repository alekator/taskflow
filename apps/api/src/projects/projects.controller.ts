import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestUser } from '../auth/request-user.type';
import { AddMemberDto } from './dto/add-member.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

type AuthedRequest = Request & { user: RequestUser };

@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private projects: ProjectsService) {}

  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: CreateProjectDto) {
    return this.projects.create(req.user.id, dto);
  }

  @Get()
  findMy(@Req() req: AuthedRequest) {
    return this.projects.findMy(req.user.id);
  }

  @Get(':projectId/members')
  listMembers(
    @Req() req: AuthedRequest,
    @Param('projectId') projectId: string,
  ) {
    return this.projects.listMembers(req.user.id, projectId);
  }

  @Post(':projectId/members')
  addMember(
    @Req() req: AuthedRequest,
    @Param('projectId') projectId: string,
    @Body() dto: AddMemberDto,
  ) {
    return this.projects.addMember(req.user.id, projectId, dto);
  }

  @Patch(':projectId/members/:userId')
  updateMemberRole(
    @Req() req: AuthedRequest,
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.projects.updateMemberRole(req.user.id, projectId, userId, dto);
  }

  @Delete(':projectId/members/:userId')
  removeMember(
    @Req() req: AuthedRequest,
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
  ) {
    return this.projects.removeMember(req.user.id, projectId, userId);
  }

  @Post(':projectId/leave')
  leave(@Req() req: AuthedRequest, @Param('projectId') projectId: string) {
    return this.projects.leave(req.user.id, projectId);
  }

  @Get(':id')
  findOne(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.projects.findOne(req.user.id, id);
  }

  @Patch(':id')
  update(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projects.update(req.user.id, id, dto);
  }

  @Delete(':id')
  remove(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.projects.remove(req.user.id, id);
  }
}
