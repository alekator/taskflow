import { TaskPriority, TaskStatus } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const taskSortFields = [
  'order',
  'createdAt',
  'updatedAt',
  'dueDate',
  'title',
  'priority',
  'status',
] as const;
const sortDirections = ['asc', 'desc'] as const;

export class ListTasksQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsIn(taskSortFields)
  sortBy?: (typeof taskSortFields)[number];

  @IsOptional()
  @IsIn(sortDirections)
  sortOrder?: (typeof sortDirections)[number];
}
