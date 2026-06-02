import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class SubmitReportArtifactDto {
  @IsUUID()
  participantId!: string;

  @IsString()
  @IsNotEmpty()
  content!: string;
}
