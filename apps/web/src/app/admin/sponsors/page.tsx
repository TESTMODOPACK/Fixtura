'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  Filter,
  Megaphone,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  POSICION_LABEL,
  POSICION_SPONSOR,
  type CreateSponsorRequest,
  type PosicionSponsor,
  type SponsorAdmin,
} from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHead } from '@/components/ui/page-head';
import {
  useCreateSponsor,
  useDeleteSponsor,
  useSponsors,
  useUpdateSponsor,
} from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

export default function SponsorsPage(): React.ReactElement {
  const [filtro, setFiltro] = useState<PosicionSponsor | 'TODAS'>('TODAS');
  const [adding, setAdding] = useState(false);
  const { data: sponsors, isLoading, error } = useSponsors(
    filtro === 'TODAS' ? undefined : filtro,
  );
  const apiError = error as ApiError | undefined;

  const stats = useMemo(() => {
    const all = sponsors ?? [];
    const hoy = new Date();
    const activosVigentes = all.filter((s) => {
      if (!s.activo) return false;
      if (s.vigenteDesde && new Date(s.vigenteDesde) > hoy) return false;
      if (s.vigenteHasta && new Date(s.vigenteHasta) < hoy) return false;
      return true;
    });
    return {
      total: all.length,
      activosVigentes: activosVigentes.length,
      pausados: all.filter((s) => !s.activo).length,
      vencidos: all.filter((s) => s.vigenteHasta && new Date(s.vigenteHasta) < hoy).length,
    };
  }, [sponsors]);

  return (
    <>
      <PageHead
        eyebrow="Comunidad"
        title="Sponsors & banners"
        sub="Subí los banners de tus auspiciadores para que aparezcan en el portal público."
      >
        <Button variant="accent" size="sm" onClick={() => setAdding((v) => !v)}>
          <Plus size={14} /> {adding ? 'Cancelar' : 'Nuevo sponsor'}
        </Button>
      </PageHead>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card padding="comfortable">
          <CardLabel>Total cargados</CardLabel>
          <div className="font-display text-3xl text-green-deep tracking-display">
            {isLoading ? '…' : stats.total}
          </div>
        </Card>
        <Card padding="comfortable">
          <CardLabel>Activos & vigentes</CardLabel>
          <div className="font-display text-3xl text-green-bright tracking-display">
            {isLoading ? '…' : stats.activosVigentes}
          </div>
          <div className="text-xs text-ink-mute font-serif italic mt-1">Visibles ahora</div>
        </Card>
        <Card padding="comfortable">
          <CardLabel>Pausados</CardLabel>
          <div className="font-display text-3xl text-ink-mute tracking-display">
            {isLoading ? '…' : stats.pausados}
          </div>
        </Card>
        <Card padding="comfortable">
          <CardLabel>Vencidos</CardLabel>
          <div
            className={cn(
              'font-display text-3xl tracking-display',
              stats.vencidos > 0 ? 'text-orange-700' : 'text-green-bright',
            )}
          >
            {isLoading ? '…' : stats.vencidos}
          </div>
        </Card>
      </div>

      {adding && (
        <Card padding="comfortable" className="mb-5">
          <SponsorForm onDone={() => setAdding(false)} />
        </Card>
      )}

      {/* Filtros por posición */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Filter size={14} className="text-ink-mute" />
        <FiltroChip active={filtro === 'TODAS'} onClick={() => setFiltro('TODAS')}>
          Todas
        </FiltroChip>
        {POSICION_SPONSOR.map((p) => (
          <FiltroChip key={p} active={filtro === p} onClick={() => setFiltro(p)}>
            {POSICION_LABEL[p]}
          </FiltroChip>
        ))}
      </div>

      {apiError && (
        <Card padding="comfortable" className="border-2 border-danger/40 bg-danger/5 mb-4">
          <div className="flex items-start gap-3 text-danger">
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">No pudimos cargar los sponsors</div>
              <div className="text-sm mt-1">{apiError.message}</div>
            </div>
          </div>
        </Card>
      )}

      <Card padding="none" className="overflow-hidden">
        {isLoading && (
          <div className="p-8 text-center font-serif italic text-ink-mute">
            Cargando sponsors…
          </div>
        )}
        {!isLoading && !apiError && (sponsors?.length ?? 0) === 0 && (
          <div className="p-12 text-center">
            <Megaphone size={36} className="mx-auto text-line mb-3" />
            <p className="font-serif italic text-ink-mute">
              Todavía no hay banners cargados{filtro !== 'TODAS' ? ' en esta posición' : ''}.
            </p>
          </div>
        )}
        {!isLoading && sponsors && sponsors.length > 0 && (
          <div className="divide-y divide-line">
            {sponsors.map((s) => (
              <SponsorRow key={s.id} sponsor={s} />
            ))}
          </div>
        )}
      </Card>
    </>
  );
}

function FiltroChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-full text-xs uppercase tracking-[0.15em] font-semibold border transition-colors',
        active
          ? 'bg-green-deep text-chalk border-green-deep'
          : 'bg-paper text-ink-mute border-line hover:border-green-deep hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

function SponsorRow({ sponsor }: { sponsor: SponsorAdmin }): React.ReactElement {
  const [editing, setEditing] = useState(false);
  const remove = useDeleteSponsor();
  const update = useUpdateSponsor(sponsor.id);

  if (editing) {
    return (
      <div className="p-5 bg-paper-dark">
        <SponsorForm
          sponsor={sponsor}
          onDone={() => setEditing(false)}
        />
      </div>
    );
  }

  const hoy = new Date();
  const vencido = sponsor.vigenteHasta && new Date(sponsor.vigenteHasta) < hoy;
  const proximo = sponsor.vigenteDesde && new Date(sponsor.vigenteDesde) > hoy;

  return (
    <div className="p-5 flex items-start gap-4">
      <div className="w-32 h-20 flex-shrink-0 bg-paper border border-line rounded-card overflow-hidden flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={sponsor.imagenUrl}
          alt={sponsor.nombre}
          className="max-w-full max-h-full object-contain"
          onError={(e) => {
            const t = e.currentTarget as HTMLImageElement;
            t.style.display = 'none';
          }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-ink">{sponsor.nombre}</span>
          <span className="text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-1 rounded bg-accent/15 text-accent">
            {POSICION_LABEL[sponsor.posicion]}
          </span>
          {!sponsor.activo && (
            <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded bg-ink-mute/15 text-ink-mute flex items-center gap-1">
              <EyeOff size={10} /> Pausado
            </span>
          )}
          {sponsor.activo && vencido && (
            <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded bg-orange-700/15 text-orange-700">
              Vencido
            </span>
          )}
          {sponsor.activo && proximo && (
            <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded bg-ink-mute/15 text-ink-mute">
              Programado
            </span>
          )}
          {sponsor.activo && !vencido && !proximo && (
            <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-1 rounded bg-green-bright/15 text-green-bright flex items-center gap-1">
              <Eye size={10} /> Visible
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-mute">
          {sponsor.linkUrl && (
            <a
              href={sponsor.linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline truncate max-w-xs flex items-center gap-1"
            >
              <ExternalLink size={11} /> {sponsor.linkUrl}
            </a>
          )}
          <span>Prioridad {sponsor.prioridad}</span>
          {sponsor.vigenteDesde && <span>desde {sponsor.vigenteDesde}</span>}
          {sponsor.vigenteHasta && <span>hasta {sponsor.vigenteHasta}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => update.mutate({ activo: !sponsor.activo })}
          className="p-1 rounded text-ink-mute hover:text-accent hover:bg-accent/10"
          title={sponsor.activo ? 'Pausar' : 'Reactivar'}
        >
          {sponsor.activo ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="p-1 rounded text-ink-mute hover:text-accent hover:bg-accent/10"
          title="Editar"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`¿Eliminar el banner "${sponsor.nombre}"? Esta acción no se puede deshacer.`)) {
              remove.mutate(sponsor.id);
            }
          }}
          className="p-1 rounded text-ink-mute hover:text-danger hover:bg-danger/10"
          title="Eliminar"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

function SponsorForm({
  sponsor,
  onDone,
}: {
  sponsor?: SponsorAdmin;
  onDone: () => void;
}): React.ReactElement {
  const create = useCreateSponsor();
  const update = useUpdateSponsor(sponsor?.id ?? '');
  const mutation = sponsor ? update : create;
  const error = mutation.error as ApiError | undefined;

  const Schema = z.object({
    nombre: z.string().min(2).max(150),
    imagenUrl: z.string().url('Debe ser una URL válida').max(500),
    linkUrl: z.union([z.literal(''), z.string().url('Debe ser una URL válida').max(500)]).optional(),
    posicion: z.enum(POSICION_SPONSOR),
    prioridad: z.coerce.number().int().min(0).max(1000).optional(),
    vigenteDesde: z.string().optional(),
    vigenteHasta: z.string().optional(),
    notas: z.string().max(1000).optional(),
  });
  type Form = z.infer<typeof Schema>;

  const form = useForm<Form>({
    resolver: zodResolver(Schema),
    defaultValues: {
      nombre: sponsor?.nombre ?? '',
      imagenUrl: sponsor?.imagenUrl ?? '',
      linkUrl: sponsor?.linkUrl ?? '',
      posicion: sponsor?.posicion ?? 'HEADER',
      prioridad: sponsor?.prioridad ?? 0,
      vigenteDesde: sponsor?.vigenteDesde ?? '',
      vigenteHasta: sponsor?.vigenteHasta ?? '',
      notas: sponsor?.notas ?? '',
    },
  });

  const onSubmit = async (vals: Form): Promise<void> => {
    const payload: CreateSponsorRequest = {
      nombre: vals.nombre,
      imagenUrl: vals.imagenUrl,
      linkUrl: vals.linkUrl || null,
      posicion: vals.posicion,
      prioridad: vals.prioridad ?? 0,
      vigenteDesde: vals.vigenteDesde || null,
      vigenteHasta: vals.vigenteHasta || null,
      notas: vals.notas || null,
    };
    if (sponsor) {
      await update.mutateAsync(payload);
    } else {
      await create.mutateAsync(payload);
    }
    form.reset();
    onDone();
  };

  const imagenVal = form.watch('imagenUrl');

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Megaphone size={18} className="text-accent" />
        <CardLabel>{sponsor ? `Editando · ${sponsor.nombre}` : 'Nuevo sponsor'}</CardLabel>
      </div>

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid grid-cols-1 md:grid-cols-3 gap-3"
      >
        <div className="md:col-span-2 space-y-3">
          <Input
            label="Nombre del sponsor"
            placeholder="Coca-Cola"
            {...form.register('nombre')}
            error={form.formState.errors.nombre?.message}
          />

          <Input
            label="URL de la imagen (banner)"
            placeholder="https://cdn.tu-cdn.com/banner.png"
            {...form.register('imagenUrl')}
            error={form.formState.errors.imagenUrl?.message}
          />

          <Input
            label="URL al hacer click (opcional)"
            placeholder="https://www.sponsor.com"
            {...form.register('linkUrl')}
            error={form.formState.errors.linkUrl?.message}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label">Posición</label>
              <select className="input" {...form.register('posicion')}>
                {POSICION_SPONSOR.map((p) => (
                  <option key={p} value={p}>
                    {POSICION_LABEL[p]}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="Prioridad (orden, mayor primero)"
              type="number"
              min={0}
              max={1000}
              {...form.register('prioridad', { valueAsNumber: true })}
              error={form.formState.errors.prioridad?.message}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label="Vigente desde (opcional)"
              type="date"
              {...form.register('vigenteDesde')}
            />
            <Input
              label="Vigente hasta (opcional)"
              type="date"
              {...form.register('vigenteHasta')}
            />
          </div>

          <div>
            <label className="label">Notas internas</label>
            <textarea
              className="input min-h-[60px]"
              placeholder="ej. cierra el 31/12, contacto: juan@sponsor.cl"
              {...form.register('notas')}
            />
          </div>
        </div>

        <div className="md:col-span-1">
          <CardLabel tone="mute">Vista previa</CardLabel>
          <div className="mt-2 bg-paper border border-line rounded-card p-3 text-center min-h-[120px] flex items-center justify-center">
            {imagenVal ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imagenVal}
                alt="preview"
                className="max-w-full max-h-32 object-contain"
                onError={(e) => {
                  const t = e.currentTarget as HTMLImageElement;
                  t.alt = '⚠️ URL inválida o imagen no carga';
                  t.style.display = 'none';
                  const parent = t.parentElement;
                  if (parent && !parent.querySelector('.preview-err')) {
                    const div = document.createElement('div');
                    div.className = 'preview-err text-xs text-danger font-serif italic';
                    div.textContent = 'No se pudo cargar la imagen';
                    parent.appendChild(div);
                  }
                }}
              />
            ) : (
              <span className="text-xs text-ink-mute font-serif italic">
                Pegá la URL de la imagen
              </span>
            )}
          </div>
        </div>

        {error && (
          <div className="md:col-span-3 text-sm text-danger bg-danger/10 px-3 py-2 rounded-card">
            {error.message}
          </div>
        )}

        <div className="md:col-span-3 flex gap-2">
          <Button type="submit" variant="accent" loading={mutation.isPending}>
            {sponsor ? (
              <>
                <CheckCircle2 size={14} /> Guardar cambios
              </>
            ) : (
              <>
                <Plus size={14} /> Crear sponsor
              </>
            )}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            <X size={14} /> Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
