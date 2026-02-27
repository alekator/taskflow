import { UserRole } from '@prisma/client';
import { IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const sortFields = ['createdAt', 'email', 'name', 'role'] as const;
const sortDirections = ['asc', 'desc'] as const;

export class ListUsersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsIn(sortFields)
  sortBy?: (typeof sortFields)[number];

  @IsOptional()
  @IsIn(sortDirections)
  sortOrder?: (typeof sortDirections)[number];
}
