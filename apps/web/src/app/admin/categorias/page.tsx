'use client';

import {
  AlertCircle,
  Layers,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { useState } from 'react';

import type { CategoriaJugadores, SerieEmbedded } from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHead } from '@/components/ui/page-head';
import {
  useCategorias,
  useCreateCategoria,
  useDeleteCategoria,
  useUpdateCategoria,
} from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

export default function CategoriasPage(): React.ReactElement {
  const { data: categorias, isLoading, error } = useCategorias();
  const [editing, setEditing] = useState<CategoriaJugadores | null>(null);
  const [creating, setCreating] = useState(false);
  const apiError = error as ApiError | undefined;

  return (
    <>
      <PageHead
        eyebrow="Configuración"
        title="Categorías y series"
        sub="Define las categorías por edad de tu liga (Senior, Super Senior, Dorados…) y las series internas de cada una."
      >
        {!creating && !editing && (
          <Button variant="accent" size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} /> Nueva categoría
          </Button>
        )}
      </PageHead>

      {apiError && (
        <Card padding="comfortable" className="mb-4 border-2 border-danger/40 bg-danger/5">
          <div className="flex items-start gap-2 text-sm text-danger">
            <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
            <div>{apiError.message}</div>
          </div>
        </Card>
      )}

      {creating && (
        <CategoriaForm onClose={() => setCreating(false)} />
      )}
      {editing && (
        <CategoriaForm
          categoria={editing}
          onClose={() => setEditing(null)}
        />
      )}

      {isLoading ? (
        <Card padding="roomy">
          <p className="font-serif italic text-ink-mute">Cargando…</p>
        </Card>
      ) : !categorias || categorias.length === 0 ? (
        <Card padding="roomy" className="text-center">
          <Layers size={32} className="mx-auto text-ink-mute mb-3" />
          <CardLabel>Sin categorías</CardLabel>
          <p className="text-sm text-ink-mute mt-2 font-serif italic">
            Todavía no creaste ninguna categoría. Aprieta &quot;Nueva categoría&quot;.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {categorias.map((c) => (
            <CategoriaRow
              key={c.id}
              categoria={c}
              onEdit={() => setEditing(c)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function CategoriaRow({
  categoria: c,
  onEdit,
}: {
  categoria: CategoriaJugadores;
  onEdit: () => void;
}): React.ReactElement {
  const del = useDeleteCategoria();
  return (
    <Card padding="comfortable">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display text-xl tracking-display text-green-deep">
              {c.nombre}
            </span>
            <span className="text-[10px] uppercase tracking-wider font-mono text-ink-mute">
              {c.slug}
            </span>
            {!c.activa && (
              <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-ink-mute/15 text-ink-mute">
                inactiva
              </span>
            )}
          </div>
          {c.descripcion && (
            <p className="text-sm text-ink-mute mt-1">{c.descripcion}</p>
          )}
          <div className="mt-2 flex items-center flex-wrap gap-3 text-sm">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-green-bright/15 text-green-bright text-xs font-semibold">
              <ShieldCheck size={12} /> Mín. {c.edadMinimaGeneral} años
            </span>
            {c.cupoExcepcionesPorEquipo > 0 && c.edadMinimaExcepcion != null && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-orange-700/15 text-orange-700 text-xs font-semibold">
                +{c.cupoExcepcionesPorEquipo} excepciones desde {c.edadMinimaExcepcion} años
              </span>
            )}
            {c.series.length > 0 && (
              <span className="text-xs text-ink-mute">
                {c.series.length} serie{c.series.length === 1 ? '' : 's'}:{' '}
                {c.series.map((s) => s.nombre).join(', ')}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Pencil size={14} /> Editar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (
                window.confirm(
                  `¿Eliminar la categoría "${c.nombre}"? Esta acción no se puede deshacer.`,
                )
              ) {
                del.mutate(c.id);
              }
            }}
            disabled={del.isPending}
            className="text-danger hover:bg-danger/10"
          >
            <Trash2 size={14} /> Eliminar
          </Button>
        </div>
      </div>
    </Card>
  );
}

function CategoriaForm({
  categoria,
  onClose,
}: {
  categoria?: CategoriaJugadores;
  onClose: () => void;
}): React.ReactElement {
  const isEdit = !!categoria;
  const create = useCreateCategoria();
  const update = useUpdateCategoria(categoria?.id ?? '');
  const mut = isEdit ? update : create;

  const [nombre, setNombre] = useState(categoria?.nombre ?? '');
  const [slug, setSlug] = useState(categoria?.slug ?? '');
  const [descripcion, setDescripcion] = useState(categoria?.descripcion ?? '');
  const [edadMinimaGeneral, setEdadMinimaGeneral] = useState<number>(
    categoria?.edadMinimaGeneral ?? 35,
  );
  const [permiteExcepciones, setPermiteExcepciones] = useState<boolean>(
    (categoria?.cupoExcepcionesPorEquipo ?? 0) > 0,
  );
  const [cupoExcepcionesPorEquipo, setCupoExcepcionesPorEquipo] = useState<number>(
    categoria?.cupoExcepcionesPorEquipo ?? 2,
  );
  const [edadMinimaExcepcion, setEdadMinimaExcepcion] = useState<number>(
    categoria?.edadMinimaExcepcion ?? Math.max(0, (categoria?.edadMinimaGeneral ?? 35) - 2),
  );
  const [orden, setOrden] = useState<number>(categoria?.orden ?? 0);
  const [activa, setActiva] = useState<boolean>(categoria?.activa ?? true);
  const [series, setSeries] = useState<SerieEmbedded[]>(categoria?.series ?? []);
  const [error, setError] = useState<string | null>(null);

  // Auto-slug solo en modo creación, basado en nombre.
  const handleNombre = (v: string): void => {
    setNombre(v);
    if (!isEdit && (!slug || slug === slugify(nombre))) {
      setSeries(series); // no-op: mantenemos series
      setSlug(slugify(v));
    }
  };

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    setError(null);

    if (permiteExcepciones && edadMinimaExcepcion >= edadMinimaGeneral) {
      setError(
        'La edad mínima de excepción debe ser MENOR a la edad mínima general.',
      );
      return;
    }

    const body = {
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || null,
      edadMinimaGeneral,
      cupoExcepcionesPorEquipo: permiteExcepciones ? cupoExcepcionesPorEquipo : 0,
      edadMinimaExcepcion: permiteExcepciones ? edadMinimaExcepcion : null,
      orden,
      activa,
      series: series.map((s, i) => ({ ...s, orden: i })),
    };

    if (isEdit) {
      update.mutate(body, {
        onSuccess: () => onClose(),
        onError: (e) => setError((e as ApiError).message ?? 'Error al guardar'),
      });
    } else {
      create.mutate(
        {
          slug: slug.trim().toLowerCase(),
          ...body,
        },
        {
          onSuccess: () => onClose(),
          onError: (e) => setError((e as ApiError).message ?? 'Error al guardar'),
        },
      );
    }
  };

  return (
    <Card padding="comfortable" className="mb-4 border-2 border-accent/40">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex items-center justify-between">
          <CardLabel>
            {isEdit ? `Editar: ${categoria!.nombre}` : 'Nueva categoría'}
          </CardLabel>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-mute hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            label="Nombre"
            placeholder="Super Senior"
            value={nombre}
            onChange={(e) => handleNombre(e.target.value)}
            required
          />
          <Input
            label="Slug (no se puede cambiar después)"
            placeholder="super-senior"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            disabled={isEdit}
            required
            pattern="^[a-z0-9-]+$"
          />
        </div>

        <div>
          <label className="label">Descripción (opcional)</label>
          <textarea
            className="input"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Ej. División de jugadores +35 años con foco competitivo."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            label="Edad mínima general (años cumplidos al cierre del año)"
            type="number"
            min={0}
            max={99}
            value={edadMinimaGeneral}
            onChange={(e) => setEdadMinimaGeneral(Number(e.target.value))}
            required
          />
          <Input
            label="Orden de display"
            type="number"
            min={0}
            value={orden}
            onChange={(e) => setOrden(Number(e.target.value))}
          />
        </div>

        {/* Excepciones */}
        <Card padding="comfortable" className="bg-paper">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={permiteExcepciones}
              onChange={(e) => setPermiteExcepciones(e.target.checked)}
            />
            <span className="text-sm font-semibold">
              Permitir excepciones de edad
            </span>
          </label>
          <p className="text-xs text-ink-mute mt-1 font-serif italic">
            Algunos jugadores por debajo de la edad general pueden inscribirse,
            hasta un cupo configurable.
          </p>
          {permiteExcepciones && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              <Input
                label="Cupo por equipo"
                type="number"
                min={1}
                max={20}
                value={cupoExcepcionesPorEquipo}
                onChange={(e) =>
                  setCupoExcepcionesPorEquipo(Number(e.target.value))
                }
              />
              <Input
                label="Edad mínima excepción"
                type="number"
                min={0}
                max={Math.max(0, edadMinimaGeneral - 1)}
                value={edadMinimaExcepcion}
                onChange={(e) => setEdadMinimaExcepcion(Number(e.target.value))}
              />
            </div>
          )}
          {permiteExcepciones && (
            <p className="text-xs text-ink-mute mt-2">
              <strong>Ejemplo:</strong> con edad mínima general{' '}
              {edadMinimaGeneral}, cupo {cupoExcepcionesPorEquipo} y mínimo
              excepción {edadMinimaExcepcion}: cada equipo puede tener hasta{' '}
              {cupoExcepcionesPorEquipo} jugador(es) entre {edadMinimaExcepcion}
              -{edadMinimaGeneral - 1} años. Por debajo de {edadMinimaExcepcion}
              , bloqueado.
            </p>
          )}
        </Card>

        {/* Series */}
        <Card padding="comfortable" className="bg-paper">
          <div className="flex items-center justify-between mb-2">
            <CardLabel>Series internas</CardLabel>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setSeries([
                  ...series,
                  { slug: '', nombre: '', orden: series.length, activa: true },
                ])
              }
            >
              <Plus size={12} /> Agregar serie
            </Button>
          </div>
          {series.length === 0 ? (
            <p className="text-xs text-ink-mute font-serif italic">
              Sin series. Agregalas si tu categoría se divide internamente
              (Primera, Segunda, Honor, etc.).
            </p>
          ) : (
            <div className="space-y-2">
              {series.map((s, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-12 md:col-span-5">
                    <Input
                      label={i === 0 ? 'Nombre' : undefined}
                      value={s.nombre}
                      onChange={(e) => {
                        const next = [...series];
                        next[i] = { ...next[i]!, nombre: e.target.value };
                        setSeries(next);
                      }}
                      placeholder="Primera"
                    />
                  </div>
                  <div className="col-span-9 md:col-span-5">
                    <Input
                      label={i === 0 ? 'Slug' : undefined}
                      value={s.slug}
                      onChange={(e) => {
                        const next = [...series];
                        next[i] = {
                          ...next[i]!,
                          slug: e.target.value.toLowerCase(),
                        };
                        setSeries(next);
                      }}
                      placeholder="primera"
                      pattern="^[a-z0-9-]+$"
                    />
                  </div>
                  <div className="col-span-3 md:col-span-2 flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSeries(series.filter((_, j) => j !== i))}
                      className="text-danger"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={activa}
            onChange={(e) => setActiva(e.target.checked)}
          />
          <span className="text-sm">Categoría activa</span>
        </label>

        {error && (
          <div
            className={cn(
              'text-sm px-3 py-2 rounded-card',
              'border border-danger/40 bg-danger/5 text-danger',
            )}
          >
            {error}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="accent" size="sm" disabled={mut.isPending}>
            {mut.isPending ? 'Guardando…' : isEdit ? 'Guardar' : 'Crear categoría'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
