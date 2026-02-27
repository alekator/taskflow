import { IsObject } from 'class-validator';

export class UpdateTaskRoadmapDto {
  @IsObject()
  data!: Record<string, unknown>;
}
