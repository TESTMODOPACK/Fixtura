export interface EquipoFixture {
  id: string;
  nombre: string;
}

export interface PartidoFixture {
  fechaNumero: number;
  equipoLocalId: string;
  equipoVisitaId: string;
  /** True si uno de los lados es "fecha libre" (bye). */
  esLibre: boolean;
}

export interface FixtureGenerado {
  fechas: number;
  partidos: PartidoFixture[];
  /** id del equipo que descansa en cada fecha (impar), o null si la fecha es completa. */
  libresPorFecha: Record<number, string | null>;
}

export interface FixtureOptions {
  /** Cantidad de ruedas. 1 = todos contra todos una vez, 2 = ida y vuelta. */
  ruedas: 1 | 2;
}
