import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1400)
  description?: string;
}
