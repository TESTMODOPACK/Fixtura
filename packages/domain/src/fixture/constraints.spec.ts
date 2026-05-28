import { describe, expect, it } from '@jest/globals';

import { aplicarConstraintsFixture } from './constraints';
import { generarFixtureBerger } from './berger';
import type { EquipoFixture } from './types';

const equipos: EquipoFixture[] = [
  { id: 'a', nombre: 'A' },
  { id: 'b', nombre: 'B' },
  { id: 'c', nombre: 'C' },
  { id: 'd', nombre: 'D' },
];

describe('aplicarConstraintsFixture', () => {
  it('no cambia un fixture válido (sin canchas compartidas, sin rachas)', () => {
    const fix = generarFixtureBerger(equipos, { ruedas: 1 });
    const r = aplicarConstraintsFixture({ fixture: fix, equipos });
    expect(r.fixture.partidos.length).toBe(fix.partidos.length);
    expect(r.warnings.length).toBe(0);
  });

  it('detecta cancha compartida en misma fecha y advierte', () => {
    const fix = generarFixtureBerger(equipos, { ruedas: 1 });
    // a y b comparten cancha. Berger los pone a ambos como local en
    // distintas fechas, pero forzamos un conflicto artificial.
    const conflictivo = {
      ...fix,
      partidos: [
        { fechaNumero: 1, equipoLocalId: 'a', equipoVisitaId: 'c', esLibre: false },
        { fechaNumero: 1, equipoLocalId: 'b', equipoVisitaId: 'd', esLibre: false },
      ],
    };
    const r = aplicarConstraintsFixture({
      fixture: conflictivo,
      equipos,
      canchaPorEquipo: { a: 'cancha1', b: 'cancha1', c: 'cancha2', d: 'cancha2' },
    });
    // Debería swapear uno para que solo haya un local en cada cancha
    // por fecha. Si no puede, debe haber warning.
    const localesFecha1 = r.fixture.partidos.filter((p) => p.fechaNumero === 1);
    const canchasLocales = new Set(
      localesFecha1.map((p) => (p.equipoLocalId === 'a' || p.equipoLocalId === 'b' ? 'cancha1' : 'cancha2')),
    );
    // Después del swap, los 2 partidos no deberían tener ambos local
    // en cancha1.
    const localesCancha1 = localesFecha1.filter(
      (p) => p.equipoLocalId === 'a' || p.equipoLocalId === 'b',
    ).length;
    expect(localesCancha1).toBeLessThanOrEqual(1);
  });

  it('mejora (o iguala) la racha máxima de localía vs el fixture original', () => {
    // 6 equipos × 2 ruedas para tener oportunidad de generar rachas.
    const seis: EquipoFixture[] = Array.from({ length: 6 }, (_, i) => ({
      id: `e${i}`,
      nombre: `E${i}`,
    }));
    const fixOriginal = generarFixtureBerger(seis, { ruedas: 2 });
    const r = aplicarConstraintsFixture({
      fixture: fixOriginal,
      equipos: seis,
      maxLocalesSeguidos: 2,
    });

    const calcularMaxRacha = (
      partidos: typeof r.fixture.partidos,
      equipoId: string,
    ): number => {
      const ps = partidos
        .filter((p) => p.equipoLocalId === equipoId || p.equipoVisitaId === equipoId)
        .sort((a, b) => a.fechaNumero - b.fechaNumero);
      let racha = 0;
      let max = 0;
      for (const p of ps) {
        if (p.equipoLocalId === equipoId) {
          racha++;
          max = Math.max(max, racha);
        } else racha = 0;
      }
      return max;
    };

    // Para cada equipo, la racha post-constraints no debería ser PEOR
    // que la original. El algoritmo es greedy y best-effort: si no
    // puede resolver, queda igual (con warning) — pero no debe empeorar.
    for (const eq of seis) {
      const maxOriginal = calcularMaxRacha(fixOriginal.partidos, eq.id);
      const maxAjustado = calcularMaxRacha(r.fixture.partidos, eq.id);
      expect(maxAjustado).toBeLessThanOrEqual(maxOriginal);
    }

    // Si algún equipo quedó con racha > 2, debe haber al menos un
    // warning (el admin tiene que enterarse).
    const algunaRachaLarga = seis.some(
      (eq) => calcularMaxRacha(r.fixture.partidos, eq.id) > 2,
    );
    if (algunaRachaLarga) {
      expect(r.warnings.length).toBeGreaterThan(0);
    }
  });

  it('preserva el set de partidos: ningún partido se duplica ni se pierde', () => {
    const fix = generarFixtureBerger(equipos, { ruedas: 2 });
    const r = aplicarConstraintsFixture({ fixture: fix, equipos });
    expect(r.fixture.partidos.length).toBe(fix.partidos.length);
    // El set de duelos (par desordenado) debe ser el mismo.
    const llaveDuelo = (a: string, b: string) => [a, b].sort().join('|');
    const originales = fix.partidos.map((p) => llaveDuelo(p.equipoLocalId, p.equipoVisitaId)).sort();
    const finales = r.fixture.partidos.map((p) => llaveDuelo(p.equipoLocalId, p.equipoVisitaId)).sort();
    expect(finales).toEqual(originales);
  });
});
