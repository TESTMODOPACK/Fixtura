import { cuentaParaTabla, esPartidoResuelto, fechaCompleta } from './index';

describe('máquina de estados de partido/fecha (T20/T22, A-4)', () => {
  describe('esPartidoResuelto', () => {
    it.each(['FINALIZADO', 'WALKOVER', 'NO_JUGADO', 'SUSPENDIDO_FUERZA_MAYOR', 'REPROGRAMADO'])(
      '%s está resuelto (no se espera acta)',
      (estado) => {
        expect(esPartidoResuelto(estado)).toBe(true);
      },
    );

    it.each(['PROGRAMADO', 'EN_CURSO'])('%s NO está resuelto', (estado) => {
      expect(esPartidoResuelto(estado)).toBe(false);
    });
  });

  describe('cuentaParaTabla', () => {
    it('solo FINALIZADO y WALKOVER suman a la tabla', () => {
      expect(cuentaParaTabla('FINALIZADO')).toBe(true);
      expect(cuentaParaTabla('WALKOVER')).toBe(true);
    });

    it('un NO_JUGADO está resuelto pero NO cuenta para la tabla', () => {
      expect(esPartidoResuelto('NO_JUGADO')).toBe(true);
      expect(cuentaParaTabla('NO_JUGADO')).toBe(false);
    });

    it.each(['PROGRAMADO', 'EN_CURSO', 'SUSPENDIDO_FUERZA_MAYOR', 'REPROGRAMADO'])(
      '%s no cuenta para la tabla',
      (estado) => {
        expect(cuentaParaTabla(estado)).toBe(false);
      },
    );
  });

  describe('fechaCompleta', () => {
    it('el caso A-4: una fecha con un NO_JUGADO entre finalizados SÍ se completa', () => {
      expect(fechaCompleta(['FINALIZADO', 'WALKOVER', 'NO_JUGADO'])).toBe(true);
    });

    it('un suspendido por fuerza mayor no bloquea el cierre de la fecha', () => {
      expect(fechaCompleta(['FINALIZADO', 'SUSPENDIDO_FUERZA_MAYOR'])).toBe(true);
    });

    it('con un partido pendiente (PROGRAMADO/EN_CURSO) la fecha sigue abierta', () => {
      expect(fechaCompleta(['FINALIZADO', 'PROGRAMADO'])).toBe(false);
      expect(fechaCompleta(['FINALIZADO', 'EN_CURSO'])).toBe(false);
    });

    it('una fecha sin partidos NO está completa (no dispara descuentos)', () => {
      expect(fechaCompleta([])).toBe(false);
    });
  });
});
