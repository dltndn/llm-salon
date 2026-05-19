import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const topicModes = ['consensus', 'options'] as const;

export class CreateTopicDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsIn(topicModes)
  mode?: (typeof topicModes)[number];

  @IsOptional()
  @IsInt()
  @Min(1)
  maxRounds?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxTurns?: number;
}
