'use client';

import {
  AlertTriangle,
  Plus,
  Shield,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import type { InscripcionTorneo, Jugador } from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { CardLabel } from '@/components/ui/card';
import {
  useAddJugadorPlanilla,
  usePlanillaTorneo,
  usePlantelClub,
  useRemoveJugadorPlanilla,
} from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';

/**
 * Drawer lateral para gestionar la planilla del torneo (subset del
 * plantel del club). Permite agregar jugadores del plantel global del
 * club (filtrados a la categoría correspondiente) y quitar jugadores
 * de la planilla del torneo (NO los borra del plantel del club).
 */
export function PlanillaTorneoDrawer({
  inscripcion,
  onClose,
}: {
  inscripcion: InscripcionTorneo;
  onClose: () => void;
}): React.ReactElement {
  const { data: planilla, isLoading: loadingP } = usePlanillaTorneo(
    inscripcion.id,
  );
  const { data: plantelClub, isLoading: loadingC } = usePlantelClub(
    inscripcion.clubId,
    inscripcion.categoriaId,
  );
  const addJugador = useAddJugadorPlanilla(inscripcion.id);
  const removeJugador = useRemoveJugadorPlanilla(inscripcion.id);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Jugadores del plantel del club que NO están todavía en la planilla del torneo.
  const enPlanilla = useMemo(
    () => new Set((planilla ?? []).map((p) => p.jugadorId)),
    [planilla],
  );
  const elegibles = (plantelClub ?? []).filter(
    (j: Jugador) => j.estado === 'ACTIVO' && !enPlanilla.has(j.id),
  );

  const handleAdd = async (jugadorId: string): Promise<void> => {
    setErrMsg(null);
    try {
      await addJugador.mutateAsync(jugadorId);
    } catch (e) {
      const err = e as ApiError;
      setErrMsg(err.message ?? 'No se pudo agregar el jugador.');
    }
  };

  const handleRemove = async (
    jugadorId: string,
    nombre: string,
  ): Promise<void> => {
    const ok = confirm(
      `¿Quitar a ${nombre} de la planilla del torneo? Sigue en el plantel del club.`,
    );
    if (!ok) return;
    setErrMsg(null);
    try {
      await removeJugador.mutateAsync(jugadorId);
    } catch (e) {
      const err = e as ApiError;
      setErrMsg(err.message ?? 'No se pudo quitar el jugador.');
    }
  };

  const cupoLleno =
    (planilla?.length ?? 0) >= inscripcion.topeJugadores;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-ink/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative bg-chalk w-full max-w-2xl h-full overflow-hidden flex flex-col border-l border-line shadow-xl">
        <div className="px-5 py-4 border-b border-line flex items-start justify-between gap-3">
          <div>
            <CardLabel>Planilla del torneo</CardLabel>
            <div className="font-display text-xl text-green-deep tracking-display flex items-center gap-2">
              <Shield size={18} /> {inscripcion.clubNombre}
            </div>
            <div className="text-xs text-ink-mute mt-0.5">
              {inscripcion.categoriaNombre}
              {inscripcion.serieNombre ? ` · ${inscripcion.serieNombre}` : ''}
              {' · '}
              <span
                className={
                  cupoLleno ? 'text-accent font-semibold' : 'text-ink-mute'
                }
              >
                {planilla?.length ?? 0}/{inscripcion.topeJugadores}{' '}
                jugadores
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 flex items-center justify-center rounded-card hover:bg-paper text-ink-mute"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {errMsg && (
          <div className="mx-5 mt-3 bg-danger/10 border border-danger/30 rounded-card px-3 py-2 text-sm text-danger flex items-start gap-2">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
            <span>{errMsg}</span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Planilla actual */}
          <section>
            <h3 className="text-[10px] uppercase tracking-[0.18em] font-semibold text-green-deep mb-2">
              → En la planilla
            </h3>
            {loadingP && (
              <p className="font-serif italic text-ink-mute text-sm">
                Cargando…
              </p>
            )}
            {!loadingP && (planilla?.length ?? 0) === 0 && (
              <div className="p-6 text-center bg-paper rounded-card">
                <p className="font-serif italic text-ink-mute text-sm">
                  La planilla está vacía. Sumá jugadores desde la lista de
                  abajo.
                </p>
              </div>
            )}
            {planilla && planilla.length > 0 && (
              <ul className="divide-y divide-line border border-line rounded-card overflow-hidden">
                {planilla.map((p) => (
                  <li
                    key={p.jugadorId}
                    className="px-3 py-2 grid grid-cols-[auto_1fr_auto_auto] gap-2 items-center"
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center border ${p.capitan ? 'bg-accent text-chalk border-accent' : 'bg-paper border-line'}`}
                    >
                      <User size={12} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-ink truncate">
                        {p.nombres} {p.apellidos}
                        {p.capitan && (
                          <span className="ml-2 text-[9px] uppercase tracking-wider font-bold px-1 py-0.5 rounded bg-accent/15 text-accent">
                            C
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-ink-mute font-mono">
                        {p.rut}
                        {p.posicion && ` · ${p.posicion}`}
                      </div>
                    </div>
                    <span className="text-xs font-mono text-ink-mute">
                      {p.numeroCamiseta != null ? `#${p.numeroCamiseta}` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleRemove(p.jugadorId, `${p.nombres} ${p.apellidos}`)
                      }
                      className="h-7 w-7 flex items-center justify-center rounded-card hover:bg-danger/10 text-danger"
                      aria-label="Quitar"
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Disponibles para agregar */}
          <section>
            <h3 className="text-[10px] uppercase tracking-[0.18em] font-semibold text-green-deep mb-2">
              → Disponibles en el plantel del club
            </h3>
            {loadingC && (
              <p className="font-serif italic text-ink-mute text-sm">
                Cargando plantel…
              </p>
            )}
            {!loadingC && elegibles.length === 0 && (
              <div className="p-6 text-center bg-paper rounded-card">
                <p className="font-serif italic text-ink-mute text-sm">
                  No quedan jugadores disponibles en el plantel del club para
                  esta categoría. Cargá más jugadores desde la{' '}
                  <a
                    href={`/admin/clubes/${inscripcion.clubId}`}
                    className="text-accent font-semibold hover:underline"
                  >
                    ficha del club
                  </a>
                  .
                </p>
              </div>
            )}
            {elegibles.length > 0 && (
              <ul className="divide-y divide-line border border-line rounded-card overflow-hidden">
                {elegibles.map((j) => (
                  <li
                    key={j.id}
                    className="px-3 py-2 grid grid-cols-[1fr_auto] gap-2 items-center"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-ink truncate">
                        {j.nombres} {j.apellidos}
                      </div>
                      <div className="text-xs text-ink-mute font-mono">
                        {j.rut}
                        {j.posicion && ` · ${j.posicion}`}
                      </div>
                    </div>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => handleAdd(j.id)}
                      disabled={cupoLleno || addJugador.isPending}
                    >
                      <Plus size={12} /> Sumar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {cupoLleno && (
              <p className="text-xs text-accent font-semibold mt-2">
                La planilla está completa ({inscripcion.topeJugadores}{' '}
                jugadores). Quitá alguno para sumar otro.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
