import { generarFixtureBerger } from './berger';
import type { EquipoFixture } from './types';

const mkEquipos = (n: number): EquipoFixture[] =>
  Array.from({ length: n }, (_, i) => ({ id: `e${i + 1}`, nombre: `Equipo ${i + 1}` }));

describe('generarFixtureBerger', () => {
  it('rechaza menos de 2 equipos', () => {
    expect(() => generarFixtureBerger([])).toThrow();
    expect(() => generarFixtureBerger(mkEquipos(1))).toThrow();
  });

  it('genera (N-1) fechas con N par, 1 rueda', () => {
    const out = generarFixtureBerger(mkEquipos(4), { ruedas: 1 });
    expect(out.fechas).toBe(3);
    expect(out.partidos).toHaveLength(6); // 4 equipos => 6 partidos en 3 fechas
  });

  it('agrega fecha libre cuando N es impar', () => {
    const out = generarFixtureBerger(mkEquipos(5), { ruedas: 1 });
    expect(out.fechas).toBe(5); // (5+1)-1 con BYE
    expect(out.partidos).toHaveLength(10); // C(5,2) = 10
    // Cada fecha tiene exactamente un equipo libre
    for (let f = 1; f <= 5; f++) {
      expect(out.libresPorFecha[f]).not.toBeNull();
    }
  });

  it('cada par de equipos juega exactamente una vez en 1 rueda', () => {
    const equipos = mkEquipos(6);
    const out = generarFixtureBerger(equipos, { ruedas: 1 });
    const pares = new Set<string>();
    for (const p of out.partidos) {
      const key = [p.equipoLocalId, p.equipoVisitaId].sort().join('-');
      expect(pares.has(key)).toBe(false);
      pares.add(key);
    }
    expect(pares.size).toBe(15); // C(6,2) = 15
  });

  it('en 2 ruedas, cada par juega dos veces e invierte localía', () => {
    const out = generarFixtureBerger(mkEquipos(4), { ruedas: 2 });
    expect(out.fechas).toBe(6);
    expect(out.partidos).toHaveLength(12); // 6 pares × 2 ruedas

    // Cada par debe aparecer como local distinto entre rueda 1 y rueda 2
    const matrizLocal: Record<string, string[]> = {};
    for (const p of out.partidos) {
      const key = [p.equipoLocalId, p.equipoVisitaId].sort().join('-');
      matrizLocal[key] ??= [];
      matrizLocal[key].push(p.equipoLocalId);
    }
    for (const locales of Object.values(matrizLocal)) {
      expect(locales).toHaveLength(2);
      expect(locales[0]).not.toBe(locales[1]);
    }
  });
});
