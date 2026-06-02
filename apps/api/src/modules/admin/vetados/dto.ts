import { IsOptional, IsString, Length } from 'class-validator';

export class CreateVetadoDto {
  @IsString()
  @Length(7, 20)
  rut!: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  motivo?: string | null;
}
