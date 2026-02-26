import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestUser } from '../auth/request-user.type';
import { AssignTaskDto } from './dto/assign-task.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TasksService } from './tasks.service';

type AuthedRequest = Request & { user: RequestUser };

@Controller('projects/:projectId/tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private tasks: TasksService) {}

  @Post()
  create(
    @Req() req: AuthedRequest,
    @Param('projectId') projectId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasks.create(req.user.id, projectId, dto);
  }

  @Get()
  list(
    @Req() req: AuthedRequest,
    @Param('projectId') projectId: string,
    @Query() query: ListTasksQueryDto,
  ) {
    return this.tasks.list(req.user.id, projectId, query);
  }

  @Patch(':id')
  update(
    @Req() req: AuthedRequest,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasks.update(req.user.id, projectId, id, ifMatch, dto);
  }

  @Delete(':id')
  remove(
    @Req() req: AuthedRequest,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string | undefined,
  ) {
    return this.tasks.remove(req.user.id, projectId, id, ifMatch);
  }

  @Patch(':id/assign')
  assign(
    @Req() req: AuthedRequest,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: AssignTaskDto,
  ) {
    return this.tasks.assign(req.user.id, projectId, id, dto.assigneeId);
  }

  @Patch(':id/unassign')
  unassign(
    @Req() req: AuthedRequest,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.tasks.unassign(req.user.id, projectId, id);
  }
}
