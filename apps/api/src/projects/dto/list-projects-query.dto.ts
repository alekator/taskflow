import { IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const projectSortFields = ['createdAt', 'name'] as const;
const sortDirections = ['asc', 'desc'] as const;

export class ListProjectsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(projectSortFields)
  sortBy?: (typeof projectSortFields)[number];

  @IsOptional()
  @IsIn(sortDirections)
  sortOrder?: (typeof sortDirections)[number];
}
