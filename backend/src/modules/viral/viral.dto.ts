import { IsString, IsOptional, IsInt, Min, Max, IsArray, IsBoolean, MaxLength } from 'class-validator';

export class CreateTemplateDto {
  @IsString() @MaxLength(100)
  name: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsString()
  category?: string;

  @IsOptional() @IsString()
  tags?: string;

  @IsOptional() @IsString()
  thumbnail?: string;

  @IsOptional() @IsString()
  reference_url?: string;

  @IsOptional() @IsString()
  reference_frames?: string;

  @IsString()
  scenes: string;

  @IsString()
  variables: string;

  @IsOptional() @IsString()
  audio?: string;

  @IsOptional() @IsBoolean()
  is_system?: boolean;
}

export class UpdateTemplateDto {
  @IsOptional() @IsString() @MaxLength(100)
  name?: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsString()
  category?: string;

  @IsOptional() @IsString()
  tags?: string;

  @IsOptional() @IsString()
  thumbnail?: string;

  @IsOptional() @IsString()
  reference_url?: string;

  @IsOptional() @IsString()
  reference_frames?: string;

  @IsOptional() @IsString()
  scenes?: string;

  @IsOptional() @IsString()
  variables?: string;

  @IsOptional() @IsString()
  audio?: string;

  @IsOptional() @IsString()
  status?: string;
}

export class ListTemplateQuery {
  @IsOptional() @IsString()
  category?: string;

  @IsOptional() @IsString()
  keyword?: string;

  @IsOptional() @IsString()
  sort?: string;

  @IsOptional() @IsInt() @Min(1)
  page?: number;

  @IsOptional() @IsInt() @Min(1) @Max(100)
  limit?: number;
}

export class AnalyzeVideoDto {
  @IsString()
  videoUrl: string;

  @IsOptional() @IsString()
  name?: string;

  @IsOptional() @IsString()
  category?: string;

  @IsOptional() @IsString()
  description?: string;
}

export class CreateProjectDto {
  @IsInt()
  template_id: number;

  @IsString() @MaxLength(100)
  name: string;

  @IsString()
  variables: string;
}

export class RegenerateSceneDto {
  @IsInt() @Min(0)
  sceneIndex: number;
}

export class UpdateProjectDto {
  @IsOptional() @IsString() @MaxLength(100)
  name?: string;

  @IsOptional() @IsString()
  variables?: string;
}
