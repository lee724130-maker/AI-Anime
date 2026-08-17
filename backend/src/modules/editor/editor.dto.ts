import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateEditorProjectDto {
  @IsString() @MaxLength(100)
  name: string;

  @IsOptional() @IsString()
  ratio?: string;

  @IsOptional() @IsString()
  resolution?: string;

  @IsOptional() @IsString()
  timeline?: string;
}

export class UpdateEditorProjectDto {
  @IsOptional() @IsString() @MaxLength(100)
  name?: string;

  @IsOptional() @IsString()
  ratio?: string;

  @IsOptional() @IsString()
  resolution?: string;

  @IsOptional() @IsString()
  timeline?: string;
}