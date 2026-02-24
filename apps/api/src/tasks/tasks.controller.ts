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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateTaskDto } from './create-task.dto';
import { AssignTaskDto } from './dto/assign-task.dto';
import { TasksService } from './tasks.service';
import { UpdateTaskDto } from './update-task.dto';
@Controller('projects/:projectId/tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private tasks: TasksService) {}

  @Post()
  create(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Body() dto: CreateTaskDto,
  ) {
    return this.tasks.create(req.user.id, projectId, dto);
  }

  @Get()
  list(@Req() req: any, @Param('projectId') projectId: string) {
    return this.tasks.list(req.user.id, projectId);
  }

  @Patch(':id')
  update(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasks.update(req.user.id, projectId, id, dto);
  }

  @Delete(':id')
  remove(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Param('id') id: string,
  ) {
    return this.tasks.remove(req.user.id, projectId, id);
  }
  @Patch(':id/assign')
  assign(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Body() dto: AssignTaskDto,
    @Req() req: any,
  ) {
    return this.tasks.assign(projectId, id, dto.assigneeId, req.user.id);
  }

  @Patch(':id/unassign')
  unassign(
    @Param('projectId') projectId: string,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.tasks.unassign(projectId, id, req.user.id);
  }
}
