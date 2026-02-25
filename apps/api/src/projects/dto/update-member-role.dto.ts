import { ProjectRole } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateMemberRoleDto {
  @IsEnum(ProjectRole)
  role!: ProjectRole;
}
