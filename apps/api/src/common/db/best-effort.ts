import { randomUUID } from 'node:crypto';

import { DataSource } from 'typeorm';

/**
 * Ejecuta `fn` protegido por un SAVEPOINT dentro de la transacción activa:
 * si `fn` falla, revierte SOLO su trabajo y la transacción del negocio
 * sigue sana. Sin savepoint, el primer error de Postgres envenena la tx
 * (25P02) y todo lo que siga muere hasta el rollback — aunque un catch
 * haya "tragado" el error original.
 *
 * Propagation.NESTED de typeorm-transactional NO sirve para esto: en 0.5.x
 * abre una conexión nueva (sin contexto RLS), no un savepoint real.
 *
 * Sin transacción activa (el SAVEPOINT falla con 25P01), ejecuta `fn` tal
 * cual: cada statement es atómico por sí mismo en autocommit.
 */
export async function bestEffort<T>(ds: DataSource, fn: () => Promise<T>): Promise<T> {
  const sp = `sp_${randomUUID().replace(/-/g, '')}`;
  try {
    await ds.query(`SAVEPOINT ${sp}`);
  } catch {
    return fn();
  }
  try {
    const resultado = await fn();
    await ds.query(`RELEASE SAVEPOINT ${sp}`);
    return resultado;
  } catch (err) {
    try {
      await ds.query(`ROLLBACK TO SAVEPOINT ${sp}`);
    } catch {
      // Conexión caída o tx ya abortada por fuera: nada que restaurar.
    }
    throw err;
  }
}
