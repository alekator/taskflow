import { IsInt, IsPositive, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateProjectAttachmentUploadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(180)
  fileName!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  mimeType!: string;

  @IsInt()
  @IsPositive()
  sizeBytes!: number;
}
