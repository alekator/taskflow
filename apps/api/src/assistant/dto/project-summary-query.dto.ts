import { IsString, MinLength } from 'class-validator';

export class ProjectSummaryQueryDto {
  @IsString()
  @MinLength(1)
  projectId!: string;
}
