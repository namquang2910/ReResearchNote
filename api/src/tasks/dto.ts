import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsNumber, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';

export class CreateTaskDto {
  @IsString() @MinLength(1) title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsDateString() dueDate?: string | null;
}
export class UpdateTaskDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() status?: string;
  /** ISO date hoặc null để xóa hạn */
  @IsOptional() @IsDateString() dueDate?: string | null;
}
export class SetLabelsDto {
  @IsArray() @IsString({ each: true }) ids: string[];
}
export class AddDepDto {
  @IsString() dependsOnId: string;
}
export class LogDto {
  @IsString() metricId: string;
  @IsNumber() value: number;
  @IsOptional() @IsNumber() std?: number;
  @IsOptional() @IsNumber() step?: number;
}

export class DraftTaskDto {
  @IsString() @MinLength(1) title: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsDateString() dueDate?: string | null;
  @IsOptional() @IsArray() @IsString({ each: true }) labels?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) dependsOn?: string[];
}
export class BulkTasksDto {
  @IsArray() @ArrayMaxSize(60) @ValidateNested({ each: true }) @Type(() => DraftTaskDto)
  tasks: DraftTaskDto[];
}
