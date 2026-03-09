import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

const notificationTypes = ['task', 'project', 'security', 'workspace'] as const;

export class ListNotificationsQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unreadOnly?: boolean;

  @IsOptional()
  @IsIn(notificationTypes)
  type?: (typeof notificationTypes)[number];
}
