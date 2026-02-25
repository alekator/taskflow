import { ProjectRole } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class AddMemberDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsEnum(ProjectRole)
  role?: ProjectRole;
}
