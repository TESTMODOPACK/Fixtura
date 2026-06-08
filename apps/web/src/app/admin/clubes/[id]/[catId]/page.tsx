'use client';

import {
  AlertTriangle,
  ArrowLeft,
  Globe,
  Mail,
  Pencil,
  Phone,
  Plus,
  Shield,
  Trash2,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { useClub, useDeleteClub } from '@/hooks/use-admin';
import { toastSuccess } from '@/lib/toast';

import { PlantelTab } from '../_plantel-tab';

import { DirectivaCategoriaForm } from './_directiva-categoria-form';
import { EditarClubDrawer } from './_editar-club-drawer';
import { DelegadoClubCard } from '@/components/delegado-club-card';

/**
 * Sprint 32 — ficha del club por categoría.
 *
 * Una ruta /admin/clubes/[id]/[catId] muestra UNA categoría del club.
 * Si el club tiene más categorías, aparecen como tabs arriba para
 * navegar entre ellas sin perder contexto.
 *
 * Lo editable acá:
 *   - Directiva específica de (club, categoría).
 *   - Plantel de la categoría (mismo componente PlantelTab).
 *
 * Los datos transversales del club (nombre, escudo, colores, página
 * web, reseña) se muestran read-only en el header pero se editan
 * desde el drawer "Editar datos del club".
 */
export default function ClubCategoriaPage({
  params,
}: {
  params: { id: string; catId: string };
}): React.ReactElement {
  const { id, catId } = params;
  const router = useRouter();
  const { data: club, isLoading } = useClub(id);
  const deleteClub = useDeleteClub();
  const [editarOpen, setEditarOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="font-serif italic text-ink-mute py-8">
        Cargando club…
      </div>
    );
  }
  if (!club) {
    return (
      <Card padding="roomy" className="text-center">
        <p className="font-serif italic text-ink-mute">
          Club no encontrado.{' '}
          <Link href="/admin/clubes" className="text-accent">
            Volver a la lista
          </Link>
          .
        </p>
      </Card>
    );
  }

  const detalle = club.categoriasDetalle.find(
    (d) => d.categoriaId === catId,
  );
  if (!detalle) {
    return (
      <Card padding="roomy" className="text-center">
        <AlertTriangle size={28} className="mx-auto text-accent mb-2" />
        <p className="font-serif italic text-ink-mute">
          Este club no participa en esa categoría.{' '}
          <Link href={`/admin/clubes/${id}`} className="text-accent">
            Ver categorías del club
          </Link>
          .
        </p>
      </Card>
    );
  }

  const clubInactivo = club.estado === 'INACTIVO';
  const otrasCategorias = club.categoriasDetalle.filter(
    (d) => d.categoriaId !== catId,
  );

  const onEliminar = (): void => {
    const ok = window.confirm(
      `¿Eliminar el club "${club.nombre}"?\n\n` +
        `Esto borra el club, todas sus categorías, su plantel completo y ` +
        `sus inscripciones a torneos. No se puede deshacer.`,
    );
    if (!ok) return;
    deleteClub.mutate(id, {
      onSuccess: () => {
        toastSuccess(`Club "${club.nombre}" eliminado.`);
        router.push('/admin/clubes');
      },
    });
  };

  return (
    <>
      <PageHead
        eyebrow={`Club · ${club.slug}`}
        title={`${club.nombre} · ${detalle.categoriaNombre}`}
        sub={
          clubInactivo
            ? '⚠ Club inactivo — no se pueden cargar jugadores ni inscribir a torneos.'
            : `${detalle.jugadoresCount} jugador(es) activos en ${detalle.categoriaNombre} · Edad mín. ${detalle.edadMinimaGeneral} años`
        }
      >
        <Link href="/admin/clubes">
          <Button variant="default" size="sm">
            <ArrowLeft size={14} /> Volver
          </Button>
        </Link>
      </PageHead>

      {/* Otras categorías del mismo club (tabs de navegación + pista para agregar) */}
      <div className="flex flex-wrap items-center gap-2 mb-4 text-xs">
        {otrasCategorias.length > 0 && (
          <>
            <span className="text-ink-mute">Otras categorías de {club.nombre}:</span>
            {otrasCategorias.map((d) => (
              <Link
                key={d.categoriaId}
                href={`/admin/clubes/${id}/${d.categoriaId}`}
                className="px-3 py-1 rounded-full border border-line bg-paper hover:border-green-deep hover:text-green-deep font-semibold transition-colors"
              >
                {d.categoriaNombre}{' '}
                <span className="font-mono opacity-60">({d.jugadoresCount})</span>
              </Link>
            ))}
          </>
        )}
        {otrasCategorias.length === 0 && (
          <span className="text-ink-mute italic">
            Este club solo participa en {detalle.categoriaNombre}.
          </span>
        )}
        <button
          type="button"
          onClick={() => setEditarOpen(true)}
          className="px-3 py-1 rounded-full border border-dashed border-green-deep/40 text-green-deep hover:bg-green-deep/5 hover:border-green-deep font-semibold transition-colors flex items-center gap-1"
          title="Abre el editor de datos del club, donde se asignan/quitan categorías"
        >
          <Plus size={12} /> Agregar otra categoría
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
        {/* Identidad transversal (read-only acá) */}
        <Card padding="roomy" className="lg:col-span-2">
          <div className="flex items-start justify-between gap-3 mb-3">
            <CardLabel>Identidad del club</CardLabel>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditarOpen(true)}
              title="Modificar nombre, escudo, colores, página web y categorías asignadas. Afecta a todas las categorías del club."
            >
              <Pencil size={12} /> Editar club / categorías
            </Button>
          </div>

          <div className="flex items-start gap-4">
            <div
              className="w-16 h-16 rounded-full flex-shrink-0 border-2 border-line flex items-center justify-center"
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
                <Shield size={28} className="text-chalk" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-display text-2xl text-green-deep tracking-display">
                {club.nombre.toUpperCase()}
              </div>
              {club.paginaWeb && (
                <a
                  href={club.paginaWeb}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-accent hover:underline flex items-center gap-1 mt-1"
                >
                  <Globe size={12} />
                  {club.paginaWeb.replace(/^https?:\/\//, '')}
                </a>
              )}
              {club.resena && (
                <p className="text-xs font-serif italic text-ink-mute mt-2 line-clamp-3">
                  {club.resena}
                </p>
              )}
            </div>
          </div>

          <div className="text-[11px] text-ink-mute font-serif italic mt-3 pt-3 border-t border-line">
            Estos datos son compartidos por todas las categorías del club.{' '}
            <button
              type="button"
              onClick={() => setEditarOpen(true)}
              className="text-accent hover:underline font-semibold not-italic"
            >
              Editar club / categorías
            </button>{' '}
            para modificarlos o asignar nuevas categorías a este club.
          </div>
        </Card>

        {/* Resumen rápido */}
        <Card padding="roomy">
          <CardLabel>Esta categoría</CardLabel>
          <div className="font-display text-2xl text-green-deep tracking-display mt-2">
            {detalle.categoriaNombre.toUpperCase()}
          </div>
          <div className="text-xs text-ink-mute mt-1">
            Mínimo {detalle.edadMinimaGeneral} años
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-ink-mute">Jugadores activos</span>
            <span className="font-display text-2xl text-green-deep tracking-display">
              {detalle.jugadoresCount}
            </span>
          </div>
        </Card>
      </div>

      {/* Acceso del delegado (alcance club, F55) */}
      <DelegadoClubCard clubId={id} />

      {/* Directiva de la categoría */}
      <Card padding="roomy" className="mb-5">
        <CardLabel>Directiva de {detalle.categoriaNombre}</CardLabel>
        <p className="text-xs font-serif italic text-ink-mute mt-1 mb-4">
          Cada categoría puede tener distinta directiva. Si las dejás todas
          iguales, copialas a mano o editá la versión &ldquo;madre&rdquo; del club.
        </p>

        {/* Resumen visual (lo que está cargado ahora) */}
        {detalle.presidente?.nombre && (
          <div className="flex items-center gap-2 text-sm mb-3">
            <User size={14} className="text-ink-mute" />
            <span className="font-semibold">{detalle.presidente.nombre}</span>
            <span className="text-xs text-ink-mute">· Presidente</span>
            {detalle.presidente.email && (
              <span className="flex items-center gap-1 text-xs text-ink-mute">
                <Mail size={10} />
                {detalle.presidente.email}
              </span>
            )}
            {detalle.presidente.telefono && (
              <span className="flex items-center gap-1 text-xs text-ink-mute">
                <Phone size={10} />
                {detalle.presidente.telefono}
              </span>
            )}
          </div>
        )}

        <DirectivaCategoriaForm
          clubId={id}
          categoriaId={catId}
          categoriaNombre={detalle.categoriaNombre}
          initialPresidente={detalle.presidente}
          initialDelegados={detalle.delegados}
        />
      </Card>

      {/* Plantel */}
      <Card padding="none" className="overflow-hidden mb-5">
        <div className="px-5 py-3 border-b border-line">
          <CardLabel>Plantel de {detalle.categoriaNombre}</CardLabel>
        </div>
        <PlantelTab
          clubId={id}
          categoriaId={catId}
          categoriaNombre={detalle.categoriaNombre}
          clubInactivo={clubInactivo}
        />
      </Card>

      {/* Zona peligrosa (transversal) */}
      <Card padding="roomy" className="border-danger/30 bg-danger/5">
        <CardLabel tone="mute">Zona peligrosa</CardLabel>
        <p className="text-xs font-serif italic text-ink-mute mt-2 mb-3">
          Eliminar el club borra <b>todas sus categorías</b>, sus planteles
          completos y todas las inscripciones a torneos. No se puede deshacer.
        </p>
        <Button
          variant="default"
          size="sm"
          onClick={onEliminar}
          loading={deleteClub.isPending}
          className="text-danger border-danger/40 hover:bg-danger/10"
        >
          <Trash2 size={14} /> Eliminar club completo
        </Button>
      </Card>

      <EditarClubDrawer
        club={club}
        open={editarOpen}
        onClose={() => setEditarOpen(false)}
      />
    </>
  );
}
