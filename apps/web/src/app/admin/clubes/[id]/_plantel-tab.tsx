'use client';

import type { Jugador } from '@fixtura/types';
import {
  AlertTriangle,
  FileSpreadsheet,
  Plus,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useDeleteJugadorClub, usePlantelClub } from '@/hooks/use-admin';
import { cn } from '@/lib/cn';

import { ImportPlantelModal } from './_import-plantel-modal';
import { NuevoJugadorForm } from './_nuevo-jugador-form';

/**
 * Sprint 32 — extraído del page.tsx original para que también lo use
 * /admin/clubes/[id]/[catId]. Misma funcionalidad: listar plantel,
 * agregar jugador, importar Excel, eliminar.
 */
export function PlantelTab({
  clubId,
  categoriaId,
  categoriaNombre,
  clubInactivo,
}: {
  clubId: string;
  categoriaId: string;
  categoriaNombre: string;
  clubInactivo: boolean;
}): React.ReactElement {
  const { data: plantel, isLoading } = usePlantelClub(clubId, categoriaId);
  const deleteJugador = useDeleteJugadorClub(clubId);
  const [adding, setAdding] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const onRemove = async (j: Jugador): Promise<void> => {
    const ok = confirm(
      `¿Eliminar a ${j.nombres} ${j.apellidos} del plantel ${categoriaNombre}?`,
    );
    if (!ok) return;
    await deleteJugador.mutateAsync(j.id);
  };

  return (
    <div>
      <div className="flex items-center justify-between px-5 py-3 border-b border-line">
        <div className="text-sm font-semibold text-ink">
          {isLoading ? '…' : (plantel?.length ?? 0)} jugador
          {(plantel?.length ?? 0) === 1 ? '' : 'es'} en {categoriaNombre}
        </div>
        {!clubInactivo && (
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setImportOpen(true)}
              title="Cargar plantel masivo desde Excel"
            >
              <FileSpreadsheet size={12} /> Importar Excel
            </Button>
            <Button
              variant="accent"
              size="sm"
              onClick={() => setAdding((v) => !v)}
            >
              <Plus size={12} /> {adding ? 'Cancelar' : 'Agregar jugador'}
            </Button>
          </div>
        )}
      </div>

      <ImportPlantelModal
        clubId={clubId}
        categoriaId={categoriaId}
        categoriaNombre={categoriaNombre}
        open={importOpen}
        onClose={() => setImportOpen(false)}
      />

      {adding && (
        <div className="px-5 py-4 bg-paper-dark border-b border-line">
          <NuevoJugadorForm
            clubId={clubId}
            categoriaId={categoriaId}
            onDone={() => setAdding(false)}
          />
        </div>
      )}

      {isLoading && (
        <div className="p-6 font-serif italic text-ink-mute">Cargando…</div>
      )}

      {!isLoading && plantel && plantel.length === 0 && !adding && (
        <div className="p-10 text-center">
          <Users size={32} className="mx-auto text-line mb-2" />
          <p className="font-serif italic text-ink-mute text-sm">
            Sin jugadores en {categoriaNombre} todavía.
          </p>
        </div>
      )}

      {plantel && plantel.length > 0 && (
        <div className="divide-y divide-line">
          {plantel.map((j) => (
            <div
              key={j.id}
              className="px-5 py-3 grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center"
            >
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center border',
                  j.capitan
                    ? 'bg-accent text-chalk border-accent'
                    : 'bg-paper border-line',
                )}
                title={j.capitan ? 'Capitán' : ''}
              >
                <User size={14} />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-ink truncate">
                  {j.nombres} {j.apellidos}
                  {j.apodo ? (
                    <span className="text-ink-mute font-normal"> «{j.apodo}»</span>
                  ) : null}
                  {j.capitan && (
                    <span className="ml-2 text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-accent/15 text-accent">
                      C
                    </span>
                  )}
                </div>
                <div className="text-xs text-ink-mute font-mono flex flex-wrap gap-3">
                  <span>{j.rut}</span>
                  {j.posicion && <span>{j.posicion}</span>}
                  {j.fechaNac && (
                    <span>
                      {j.fechaNac} · edad cal. {j.edadCalendario ?? '?'}
                    </span>
                  )}
                  {j.email && <span>· {j.email}</span>}
                </div>
              </div>
              <div className="text-sm font-mono text-ink-mute">
                {j.numeroCamiseta != null ? `#${j.numeroCamiseta}` : ''}
              </div>
              <button
                type="button"
                onClick={() => onRemove(j)}
                className="h-8 w-8 flex items-center justify-center rounded-card hover:bg-danger/10 text-danger"
                aria-label="Eliminar jugador"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {clubInactivo && (
        <div className="px-5 py-3 bg-accent/10 border-t border-accent/30 text-xs text-ink flex items-center gap-2">
          <AlertTriangle size={14} className="flex-shrink-0" />
          Club inactivo — no se pueden cargar nuevos jugadores. Reactivalo desde
          editar club.
        </div>
      )}
    </div>
  );
}
