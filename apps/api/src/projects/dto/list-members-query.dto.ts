import { ProjectRole } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const memberSortFields = ['createdAt', 'role'] as const;
const sortDirections = ['asc', 'desc'] as const;

export class ListMembersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(ProjectRole)
  role?: ProjectRole;

  @IsOptional()
  @IsIn(memberSortFields)
  sortBy?: (typeof memberSortFields)[number];

  @IsOptional()
  @IsIn(sortDirections)
  sortOrder?: (typeof sortDirections)[number];
}
