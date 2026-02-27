import { IsIn, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const sortDirections = ['asc', 'desc'] as const;

export class ListAssistantMessagesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(sortDirections)
  sortOrder?: (typeof sortDirections)[number];
}
