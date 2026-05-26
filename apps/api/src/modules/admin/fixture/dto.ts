import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class GenerarFixtureDto {
  @IsDateString()
  fechaInicio!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  diasEntreFechas?: number = 7;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Matches(/^\d{2}:\d{2}$/, { each: true, message: 'Horario en formato HH:mm' })
  horariosPorFecha?: string[] = ['10:00', '12:00', '14:00', '16:00'];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  canchas?: string[] = ['Cancha 1', 'Cancha 2', 'Cancha 3', 'Cancha 4'];
}
