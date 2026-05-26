import { IsInt, IsOptional, IsString, Length, Max, Min, IsDateString } from 'class-validator';

export class CreateTemporadaDto {
  @IsString()
  @Length(2, 100)
  nombre!: string;

  @IsInt()
  @Min(2000)
  @Max(2100)
  anio!: number;

  @IsOptional()
  @IsDateString()
  fechaInicio?: string | null;

  @IsOptional()
  @IsDateString()
  fechaFin?: string | null;
}
