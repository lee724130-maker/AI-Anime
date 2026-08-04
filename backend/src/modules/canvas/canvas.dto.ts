import { IsString, IsOptional, IsInt, Min, Max, IsArray, IsBoolean, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCanvasProjectDto {
  @IsString() @MaxLength(100)
  name: string;

  @IsOptional() @IsString()
  ratio?: string;

  @IsOptional() @IsString()
  resolution?: string;

  @IsOptional() @IsString()
  nodes?: string;

  @IsOptional() @IsString()
  bgm_url?: string;

  @IsOptional() @IsInt()
  template_id?: number;

  @IsOptional()
  variable_values?: Record<string, string>;
}

export class UpdateCanvasProjectDto {
  @IsOptional() @IsString() @MaxLength(100)
  name?: string;

  @IsOptional() @IsString()
  ratio?: string;

  @IsOptional() @IsString()
  resolution?: string;

  @IsOptional() @IsString()
  nodes?: string;

  @IsOptional() @IsString()
  bgm_url?: string;
}

export class ListCanvasTemplateQuery {
  @IsOptional() @IsString()
  category?: string;

  @IsOptional() @IsString()
  keyword?: string;
}

export class CreateCanvasTemplateDto {
  @IsString() @MaxLength(100)
  name: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsString()
  category?: string;

  @IsOptional() @IsString()
  ratio?: string;

  @IsOptional() @IsString()
  resolution?: string;

  @IsString()
  nodes: string;

  @IsString()
  variables: string;

  @IsOptional() @IsBoolean()
  is_system?: boolean;
}

export class UpdateCanvasTemplateDto {
  @IsOptional() @IsString() @MaxLength(100)
  name?: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsString()
  category?: string;

  @IsOptional() @IsString()
  ratio?: string;

  @IsOptional() @IsString()
  resolution?: string;

  @IsOptional() @IsString()
  nodes?: string;

  @IsOptional() @IsString()
  variables?: string;

  @IsOptional() @IsString()
  status?: string;
}

export class SaveAsTemplateDto {
  @IsString() @MaxLength(100)
  name: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsString()
  category?: string;

  @IsArray()
  variables: { key: string; label: string; type: string; default_value: string; required: boolean }[];
}