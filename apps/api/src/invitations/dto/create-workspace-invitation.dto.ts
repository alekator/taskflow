import { WorkspaceMemberRole } from '@prisma/client';
import { IsEmail, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export class CreateWorkspaceInvitationDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsEnum(WorkspaceMemberRole)
  role?: WorkspaceMemberRole;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  expiresInDays?: number;
}
