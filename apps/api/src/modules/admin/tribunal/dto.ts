import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateSancionTribunalDto {
  @IsUUID()
  jugadorInscritoId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  fechasSuspension!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  descripcion!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  desdeFechaNumero?: number;
}
