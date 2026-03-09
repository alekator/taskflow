import { IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class CreateCheckoutSessionDto {
  @IsString()
  @MinLength(2)
  planCode!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  seats?: number;

  @IsOptional()
  @IsString()
  successUrl?: string;

  @IsOptional()
  @IsString()
  cancelUrl?: string;
}
