'use client';

import {
  AlertTriangle,
  ArrowLeft,
  Globe,
  Mail,
  Phone,
  Plus,
  Shield,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

import type { Jugador } from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import {
  useCategorias,
  useClub,
  useDeleteClub,
  useDeleteJugadorClub,
  usePlantelClub,
} from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

import { NuevoJugadorForm } from './_nuevo-jugador-form';

export default function ClubDetallePage({
  params,
}: {
  params: { id: string };
}): React.ReactElement {
  const { id } = params;
  const router = useRouter();
  const { data: club, isLoading } = useClub(id);
  const { data: categorias } = useCategorias();
  const deleteClub = useDeleteClub();

  // Categoría activa para mostrar plantel. Default: primera del club.
  const [categoriaActiva, setCategoriaActiva] = useState<string>('');
  // Inicializar la categoría activa cuando carga el club.
  useMemo(() => {
    if (club && !categoriaActiva && club.categoriaIds.length > 0) {
      setCategoriaActiva(club.categoriaIds[0]!);
    }
  }, [club, categoriaActiva]);

  if (isLoading) {
    return <p className="font-serif italic text-ink-mute">Cargando club…</p>;
  }
  if (!club) {
    return (
      <Card padding="roomy">
        <div className="font-display text-2xl text-green-deep tracking-display mb-2">
          CLUB NO ENCONTRADO
        </div>
        <Link href="/admin/clubes">
          <Button variant="default" size="sm">
            <ArrowLeft size={14} /> Volver al listado
          </Button>
        </Link>
      </Card>
    );
  }

  const onDelete = async (): Promise<void> => {
    const ok = confirm(
      `¿Eliminar el club "${club.nombre}"? Esta acción borra también ` +
        `todo su plantel y sus inscripciones a torneos. No se puede deshacer.`,
    );
    if (!ok) return;
    try {
      await deleteClub.mutateAsync(club.id);
      router.push('/admin/clubes');
    } catch (err) {
      const apiErr = err as ApiError;
      alert(apiErr.message ?? 'No se pudo eliminar el club.');
    }
  };

  const categoriaActivaInfo = categorias?.find((c) => c.id === categoriaActiva);

  return (
    <>
      <PageHead
        eyebrow={`Club · ${club.slug}`}
        title={club.nombre}
        sub={
          club.estado === 'INACTIVO'
            ? '⚠ Club inactivo — no se pueden cargar jugadores ni inscribir a torneos.'
            : `${club.jugadoresCount} jugador(es) en ${club.categoriaNombres.length} categoría(s)`
        }
      >
        <Link href="/admin/clubes">
          <Button variant="default" size="sm">
            <ArrowLeft size={14} /> Volver
          </Button>
        </Link>
      </PageHead>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        {/* Identidad */}
        <Card padding="comfortable" className="lg:col-span-2">
          <CardLabel>Identidad</CardLabel>
          <div className="flex items-start gap-4 mt-3">
            <div
              className="w-20 h-20 rounded-full flex-shrink-0 border-2 border-line flex items-center justify-center"
              style={{ backgroundColor: club.colorPrimario ?? '#888278' }}
            >
              {club.escudoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={club.escudoUrl}
                  alt={club.nombre}
                  className="w-full h-full object-contain rounded-full"
                />
              ) : (
                <Shield size={32} className="text-chalk" />
              )}
            </div>
            <div className="flex-1 space-y-1.5 text-sm">
              {club.paginaWeb && (
                <a
                  href={club.paginaWeb}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-accent hover:underline"
                >
                  <Globe size={14} /> {club.paginaWeb}
                </a>
              )}
              {club.resena && (
                <p className="font-serif italic text-ink-mute mt-2">
                  {club.resena}
                </p>
              )}
              <div className="flex flex-wrap gap-1 mt-3">
                {club.categoriaNombres.map((n, i) => (
                  <span
                    key={i}
                    className="text-[10px] uppercase tracking-[0.15em] font-semibold px-2 py-0.5 rounded bg-green-deep/10 text-green-deep"
                  >
                    {n}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Directiva */}
        <Card padding="comfortable">
          <CardLabel>Directiva</CardLabel>
          <div className="space-y-3 mt-3 text-sm">
            {club.presidente ? (
              <div>
                <div className="text-[10px] uppercase tracking-[0.15em] font-semibold text-ink-mute mb-0.5">
                  Presidente
                </div>
                <div className="font-semibold text-ink">{club.presidente.nombre}</div>
                {club.presidente.email && (
                  <div className="text-xs text-ink-mute flex items-center gap-1">
                    <Mail size={11} /> {club.presidente.email}
                  </div>
                )}
                {club.presidente.telefono && (
                  <div className="text-xs text-ink-mute flex items-center gap-1">
                    <Phone size={11} /> {club.presidente.telefono}
                  </div>
                )}
              </div>
            ) : (
              <p className="font-serif italic text-ink-mute text-xs">
                Sin presidente cargado.
              </p>
            )}

            {club.delegados.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-[0.15em] font-semibold text-ink-mute mb-0.5">
                  Delegados
                </div>
                <ul className="space-y-2">
                  {club.delegados.map((d, i) => (
                    <li key={i} className="text-xs">
                      <div className="font-semibold text-ink">{d.nombre}</div>
                      {d.email && (
                        <div className="text-ink-mute flex items-center gap-1">
                          <Mail size={10} /> {d.email}
                        </div>
                      )}
                      {d.telefono && (
                        <div className="text-ink-mute flex items-center gap-1">
                          <Phone size={10} /> {d.telefono}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Tabs por categoría + plantel */}
      <Card padding="none" className="overflow-hidden mb-4">
        <div className="px-5 py-3 border-b border-line">
          <CardLabel>Planteles por categoría</CardLabel>
          <p className="text-xs text-ink-mute font-serif italic mt-1">
            Cada categoría tiene su propio plantel. Un jugador no puede estar en
            dos planteles del mismo tenant.
          </p>
        </div>
        {club.categoriaIds.length === 0 ? (
          <div className="p-8 text-center font-serif italic text-ink-mute">
            Este club no tiene categorías asignadas todavía. Editalo para
            agregarlas.
          </div>
        ) : (
          <>
            <div className="flex gap-1 px-5 pt-3 border-b border-line overflow-x-auto">
              {club.categoriaIds.map((catId, i) => {
                const nom = club.categoriaNombres[i] ?? '';
                const activo = categoriaActiva === catId;
                return (
                  <button
                    key={catId}
                    type="button"
                    onClick={() => setCategoriaActiva(catId)}
                    className={cn(
                      'px-4 py-2 text-xs uppercase tracking-[0.15em] font-semibold border-b-2 -mb-px transition-colors',
                      activo
                        ? 'border-accent text-accent'
                        : 'border-transparent text-ink-mute hover:text-ink',
                    )}
                  >
                    {nom}
                  </button>
                );
              })}
            </div>

            {categoriaActiva && (
              <PlantelTab
                clubId={club.id}
                categoriaId={categoriaActiva}
                categoriaNombre={categoriaActivaInfo?.nombre ?? ''}
                clubInactivo={club.estado === 'INACTIVO'}
              />
            )}
          </>
        )}
      </Card>

      {/* Acciones peligrosas */}
      <Card padding="comfortable" className="border-danger/40">
        <CardLabel>Zona peligrosa</CardLabel>
        <p className="text-sm text-ink-mute mt-2 mb-3">
          Eliminar el club borra también su plantel y todas las inscripciones
          a torneos del modelo nuevo. Las actas históricas se mantienen.
        </p>
        <Button
          variant="default"
          size="sm"
          onClick={onDelete}
          loading={deleteClub.isPending}
          className="text-danger border-danger/40 hover:bg-danger/10"
        >
          <Trash2 size={14} /> Eliminar club
        </Button>
      </Card>
    </>
  );
}

function PlantelTab({
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
          <Button
            variant="accent"
            size="sm"
            onClick={() => setAdding((v) => !v)}
          >
            <Plus size={12} /> {adding ? 'Cancelar' : 'Agregar jugador'}
          </Button>
        )}
      </div>

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
                    <span className="text-ink-mute font-normal">
                      {' '}
                      «{j.apodo}»
                    </span>
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
