import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MinLength, IsArray } from 'class-validator';

export class CreateProjectDto {
  @IsString() @MinLength(1) title: string;
  @IsOptional() @IsString() description?: string;
  /** tên metric tạo sẵn, theo thứ tự */
  @IsOptional() @IsArray() @IsString({ each: true }) metrics?: string[];
}
export class UpdateProjectDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() favorite?: boolean;
  @IsOptional() @IsString() color?: string;
}
export class CreateMetricDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsIn(['high', 'low']) better?: string;
}
export class UpdateMetricDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() unit?: string;
  @IsOptional() @IsIn(['high', 'low']) better?: string;
  @IsOptional() @IsInt() order?: number;
}
export class ReorderDto {
  @IsArray() @IsString({ each: true }) ids: string[];
}
export class CreateLabelDto {
  @IsString() @MinLength(1) name: string;
  @IsOptional() @IsString() color?: string;
}
export class UpdateLabelDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() color?: string;
}
