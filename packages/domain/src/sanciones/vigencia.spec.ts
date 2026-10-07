import { sancionVigente } from './vigencia';

const base = {
  fechasPendientes: 2,
  cumplida: false,
  revocada: false,
  desdeFechaNumero: 3,
};

describe('sancionVigente (T20/T22, A-4)', () => {
  it('vigente: pendientes > 0, no cumplida, dentro del rango de fechas', () => {
    expect(sancionVigente(base, 3)).toBe(true);
    expect(sancionVigente(base, 10)).toBe(true);
  });

  it('el caso del carnet (A-4): una sanción que empieza en una fecha FUTURA no bloquea hoy', () => {
    expect(sancionVigente(base, 2)).toBe(false);
  });

  it('sin fecha de referencia degrada a "tiene pendientes" (vigente aunque empiece después)', () => {
    expect(sancionVigente(base)).toBe(true);
    expect(sancionVigente(base, null)).toBe(true);
  });

  it('cumplida o sin pendientes → no vigente', () => {
    expect(sancionVigente({ ...base, cumplida: true }, 5)).toBe(false);
    expect(sancionVigente({ ...base, fechasPendientes: 0 }, 5)).toBe(false);
  });

  it('revocada por el tribunal → no vigente, aunque tenga pendientes', () => {
    expect(sancionVigente({ ...base, revocada: true }, 5)).toBe(false);
  });

  it('sin desdeFechaNumero (legacy) aplica desde siempre', () => {
    expect(sancionVigente({ ...base, desdeFechaNumero: null }, 1)).toBe(true);
  });
});
