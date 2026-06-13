'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  Gavel,
  Lock,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { SancionAdmin } from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { makeRhfErrorHandler } from '@/components/ui/form-errors';
import { Input } from '@/components/ui/input';
import { PageHead } from '@/components/ui/page-head';
import {
  useAjustarSancion,
  useCreateSancionTribunal,
  useEquipos,
  useJugadores,
  useRevokeSancion,
  useSanciones,
  useTorneo,
} from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { toastError, toastSuccess } from '@/lib/toast';

const MOTIVO_LABEL: Record<string, string> = {
  ACUMULACION_AMARILLAS: '5 amarillas acumuladas',
  ROJA_DIRECTA: 'Roja directa',
  DOBLE_AMARILLA: 'Doble amarilla',
  TRIBUNAL: 'Tribunal',
};

const MOTIVO_BADGE: Record<string, string> = {
  ACUMULACION_AMARILLAS: 'bg-yellow-400/20 text-yellow-700',
  ROJA_DIRECTA: 'bg-danger/15 text-danger',
  DOBLE_AMARILLA: 'bg-orange-700/15 text-orange-700',
  TRIBUNAL: 'bg-green-deep/10 text-green-deep',
};

export default function TribunalPage({
  params,
}: {
  params: { id: string };
}): React.ReactElement {
  const torneoId = params.id;
  const { data: torneo } = useTorneo(torneoId);
  const { data: sanciones, isLoading } = useSanciones(torneoId);
  const [adding, setAdding] = useState(false);

  const activas = sanciones?.filter((s) => !s.cumplida && s.fechasPendientes > 0) ?? [];
  const cumplidas = sanciones?.filter((s) => s.cumplida || s.fechasPendientes === 0) ?? [];

  // Gate por estado del torneo:
  //   DRAFT   → sin tribunal (no se ingresa nada).
  //   ACTIVO  → operación normal.
  //   CERRADO → solo resoluciones de cierre (mismo mecanismo, otro encuadre).
  const estado = torneo?.estado;
  const esDraft = estado === 'DRAFT';
  const esCierre = estado === 'CERRADO';
  const puedeIngresar = estado === 'ACTIVO' || estado === 'CERRADO';

  return (
    <>
      <PageHead
        eyebrow={torneo ? `Torneo · ${torneo.nombre}` : 'Tribunal'}
        title="Tribunal de disciplina"
        sub="Sanciones automáticas por tarjetas + sanciones manuales del tribunal. La regla es por RUT × torneo: cambiar de club no evade la sanción."
      >
        <Link href={`/admin/torneos/${torneoId}`}>
          <Button variant="default" size="sm">
            <ArrowLeft size={14} /> Torneo
          </Button>
        </Link>
        {puedeIngresar && (
          <Button variant="accent" size="sm" onClick={() => setAdding((v) => !v)}>
            <Gavel size={14} />{' '}
            {adding
              ? 'Cancelar'
              : esCierre
                ? 'Resolución de cierre'
                : 'Sanción manual'}
          </Button>
        )}
      </PageHead>

      {esDraft && (
        <Card padding="comfortable" className="mb-5 border-orange-700/30 bg-orange-700/5">
          <div className="flex items-start gap-3">
            <Lock size={18} className="text-orange-700 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-ink">
              <div className="font-semibold mb-0.5">Torneo en borrador</div>
              <p className="font-serif italic text-ink-mute">
                El tribunal opera cuando el torneo arranca. Inicia el torneo
                (ponlo “En curso”) para imponer sanciones — todavía no hay
                partidos ni disciplina que registrar.
              </p>
            </div>
          </div>
        </Card>
      )}

      {esCierre && (
        <Card padding="comfortable" className="mb-5 border-line bg-paper/60">
          <div className="flex items-start gap-3">
            <Gavel size={18} className="text-ink-mute flex-shrink-0 mt-0.5" />
            <div className="text-sm text-ink">
              <div className="font-semibold mb-0.5">Torneo cerrado</div>
              <p className="font-serif italic text-ink-mute">
                El torneo terminó. Solo se admiten <b>resoluciones de cierre</b>
                {' '}(fallos posteriores del tribunal). Las sanciones por fecha ya
                no afectan partidos — quedan como registro disciplinario.
              </p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
        <Card padding="comfortable">
          <CardLabel>Activas</CardLabel>
          <div className="font-display text-3xl text-green-deep tracking-display">
            {isLoading ? '…' : activas.length}
          </div>
          <div className="text-xs text-ink-mute font-serif italic mt-1">Jugadores bloqueados</div>
        </Card>
        <Card padding="comfortable">
          <CardLabel>Cumplidas</CardLabel>
          <div className="font-display text-3xl text-green-bright tracking-display">
            {isLoading ? '…' : cumplidas.length}
          </div>
          <div className="text-xs text-ink-mute font-serif italic mt-1">Historial</div>
        </Card>
        <Card padding="comfortable">
          <CardLabel>Automáticas</CardLabel>
          <div className="font-display text-3xl text-green-deep tracking-display">
            {isLoading ? '…' : sanciones?.filter((s) => s.motivo !== 'TRIBUNAL').length ?? 0}
          </div>
          <div className="text-xs text-ink-mute font-serif italic mt-1">Por tarjetas</div>
        </Card>
        <Card padding="comfortable" variant="lime">
          <CardLabel tone="mute">Tribunal</CardLabel>
          <div className="font-display text-3xl text-green-deep tracking-display">
            {isLoading ? '…' : sanciones?.filter((s) => s.motivo === 'TRIBUNAL').length ?? 0}
          </div>
          <div className="text-xs text-green-deep/70 font-serif italic mt-1">Resoluciones manuales</div>
        </Card>
      </div>

      {adding && puedeIngresar && (
        <Card padding="comfortable" className="mb-5">
          <NuevaSancionTribunalForm
            torneoId={torneoId}
            esCierre={esCierre}
            onDone={() => setAdding(false)}
          />
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SancionesSection
          titulo="Sanciones activas"
          icon={Ban}
          sanciones={activas}
          torneoId={torneoId}
          emptyMsg="No hay jugadores con sanciones activas. Buen comportamiento general 👏"
        />
        <SancionesSection
          titulo="Sanciones cumplidas"
          icon={CheckCircle2}
          sanciones={cumplidas}
          torneoId={torneoId}
          emptyMsg="Aún no hay sanciones cumplidas."
          historico
        />
      </div>
    </>
  );
}

function SancionesSection({
  titulo,
  icon: Icon,
  sanciones,
  torneoId,
  emptyMsg,
  historico,
}: {
  titulo: string;
  icon: typeof Ban;
  sanciones: SancionAdmin[];
  torneoId: string;
  emptyMsg: string;
  historico?: boolean;
}): React.ReactElement {
  const revoke = useRevokeSancion(torneoId);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="px-5 py-3 bg-paper-dark border-b border-line flex items-center gap-2">
        <Icon size={16} className={historico ? 'text-green-bright' : 'text-accent'} />
        <CardLabel tone="mute">{titulo}</CardLabel>
      </div>

      {sanciones.length === 0 && (
        <div className="p-8 text-center text-sm text-ink-mute font-serif italic">{emptyMsg}</div>
      )}

      {sanciones.length > 0 && (
        <div className="divide-y divide-line">
          {sanciones.map((s) => (
            <div key={s.id} className="px-5 py-4">
              <div className="flex items-start gap-3 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-ink truncate">
                    {s.jugadorNombre && s.jugadorApellido
                      ? `${s.jugadorNombre} ${s.jugadorApellido}`
                      : 'Sin jugador identificado'}
                  </div>
                  <div className="text-xs text-ink-mute truncate">
                    {s.equipoNombre} {s.rut && <span className="font-mono">· {s.rut}</span>}
                  </div>
                </div>
                <span
                  className={cn(
                    'text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-1 rounded',
                    MOTIVO_BADGE[s.motivo] ?? 'bg-ink-mute/10 text-ink-mute',
                  )}
                >
                  {MOTIVO_LABEL[s.motivo] ?? s.motivo}
                </span>
              </div>

              <div className="flex items-center gap-4 text-xs text-ink-mute">
                <span>
                  Desde fecha <span className="font-mono font-semibold text-ink">{s.desdeFechaNumero}</span>
                </span>
                <span>
                  Pendientes{' '}
                  <span
                    className={cn(
                      'font-mono font-semibold',
                      s.fechasPendientes > 0 ? 'text-danger' : 'text-green-bright',
                    )}
                  >
                    {s.fechasPendientes}
                  </span>
                </span>
                {s.descripcion && (
                  <span className="font-serif italic truncate flex-1">{s.descripcion.split('\n')[0]}</span>
                )}
                {!historico && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setEditingId(editingId === s.id ? null : s.id)
                      }
                      className="p-1 rounded text-ink-mute hover:text-accent hover:bg-accent/10"
                      title="Ajustar sanción (agravar / corregir)"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => revoke.mutate(s.id)}
                      className="p-1 rounded text-ink-mute hover:text-danger hover:bg-danger/10"
                      title="Revocar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>

              {!historico && editingId === s.id && (
                <AjustarSancionForm
                  sancion={s}
                  torneoId={torneoId}
                  onClose={() => setEditingId(null)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function AjustarSancionForm({
  sancion,
  torneoId,
  onClose,
}: {
  sancion: SancionAdmin;
  torneoId: string;
  onClose: () => void;
}): React.ReactElement {
  const ajustar = useAjustarSancion(torneoId);
  const [fechasPendientes, setFechasPendientes] = useState(
    sancion.fechasPendientes,
  );
  const [desdeFechaNumero, setDesdeFechaNumero] = useState(
    String(sancion.desdeFechaNumero),
  );
  const [motivoAjuste, setMotivoAjuste] = useState('');

  const submit = async (): Promise<void> => {
    if (motivoAjuste.trim().length < 3) {
      toastError(new Error('Indica el motivo del ajuste (mín. 3 caracteres).'));
      return;
    }
    const desde = Number(desdeFechaNumero);
    try {
      await ajustar.mutateAsync({
        id: sancion.id,
        input: {
          fechasPendientes,
          desdeFechaNumero:
            Number.isFinite(desde) && desde >= 1 ? desde : undefined,
          motivoAjuste: motivoAjuste.trim(),
        },
      });
      toastSuccess(
        fechasPendientes === 0
          ? 'Sanción marcada como cumplida.'
          : `Sanción ajustada a ${fechasPendientes} fecha(s) pendiente(s).`,
      );
      onClose();
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <div className="mt-3 rounded-card border border-line bg-paper-dark/40 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Gavel size={14} className="text-accent" />
        <CardLabel>Ajustar sanción del tribunal</CardLabel>
      </div>
      <p className="text-xs text-ink-mute font-serif italic mb-3">
        Sube las fechas pendientes si hay incidencias extra (agresión, insultos,
        etc.). Queda registrado en el historial de la sanción.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Fechas pendientes (nuevo total)</label>
          <Input
            type="number"
            min={0}
            max={40}
            value={fechasPendientes}
            onChange={(e) => setFechasPendientes(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="label">Desde fecha número</label>
          <Input
            type="number"
            min={1}
            value={desdeFechaNumero}
            onChange={(e) => setDesdeFechaNumero(e.target.value)}
          />
        </div>
      </div>
      <div className="mt-3">
        <label className="label">Motivo del ajuste</label>
        <textarea
          className="input min-h-[60px]"
          placeholder="Ej. Agravada por agresión al árbitro tras la expulsión: +3 fechas. Fallo del tribunal."
          value={motivoAjuste}
          onChange={(e) => setMotivoAjuste(e.target.value)}
          maxLength={1000}
        />
      </div>
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          variant="accent"
          size="sm"
          loading={ajustar.isPending}
          onClick={submit}
        >
          <Gavel size={14} /> Guardar ajuste
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          <X size={14} /> Cancelar
        </Button>
      </div>
    </div>
  );
}

function NuevaSancionTribunalForm({
  torneoId,
  esCierre,
  onDone,
}: {
  torneoId: string;
  esCierre?: boolean;
  onDone: () => void;
}): React.ReactElement {
  const equiposQ = useEquipos(torneoId);
  const [equipoSeleccionado, setEquipoSeleccionado] = useState<string>('');
  const jugadoresQ = useJugadores(equipoSeleccionado || null);
  const mutation = useCreateSancionTribunal(torneoId);

  const Schema = z.object({
    jugadorInscritoId: z.string().min(1, 'Elige un jugador'),
    fechasSuspension: z.coerce.number().int().min(1).max(20),
    descripcion: z.string().min(3).max(1000),
    // Campo opcional: con valueAsNumber un input vacío entrega NaN, que NO
    // es undefined → rompía la validación en silencio (el botón "no hacía
    // nada"). Lo normalizamos: vacío/NaN → undefined.
    desdeFechaNumero: z.preprocess(
      (v) => {
        if (v === '' || v === undefined || v === null) return undefined;
        const n = typeof v === 'number' ? v : Number(v);
        return Number.isNaN(n) ? undefined : n;
      },
      z.number().int().min(1).optional(),
    ),
    vetoPermanente: z.boolean().default(false),
  });
  type Form = z.infer<typeof Schema>;

  const form = useForm<Form>({
    resolver: zodResolver(Schema),
    defaultValues: {
      jugadorInscritoId: '',
      fechasSuspension: 1,
      descripcion: '',
      vetoPermanente: false,
    },
  });

  const onSubmit = async (vals: Form): Promise<void> => {
    if (vals.vetoPermanente) {
      const ok = confirm(
        '¿Confirmas VETO DE POR VIDA? Esto agrega el RUT del jugador a la ' +
          'lista negra de la liga. No podrá ser fichado por ningún club en ' +
          'ningún torneo futuro hasta que un admin levante el veto manualmente.',
      );
      if (!ok) return;
    }
    await mutation.mutateAsync({
      jugadorInscritoId: vals.jugadorInscritoId,
      fechasSuspension: vals.fechasSuspension,
      descripcion: vals.descripcion,
      desdeFechaNumero: vals.desdeFechaNumero,
      vetoPermanente: vals.vetoPermanente,
    });
    form.reset();
    setEquipoSeleccionado('');
    onDone();
  };

  const error = mutation.error as ApiError | undefined;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={18} className="text-accent" />
        <CardLabel>
          {esCierre ? 'Resolución de cierre del torneo' : 'Nueva sanción del tribunal'}
        </CardLabel>
      </div>

      <form
        onSubmit={form.handleSubmit(
          onSubmit,
          makeRhfErrorHandler({ formName: 'sancion-tribunal' }),
        )}
        className="grid grid-cols-1 md:grid-cols-2 gap-3"
      >
        <div>
          <label className="label">Equipo</label>
          <select
            className="input"
            value={equipoSeleccionado}
            onChange={(e) => {
              setEquipoSeleccionado(e.target.value);
              form.setValue('jugadorInscritoId', '');
            }}
          >
            <option value="">— elige equipo —</option>
            {equiposQ.data?.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Jugador</label>
          <select className="input" {...form.register('jugadorInscritoId')} disabled={!equipoSeleccionado}>
            <option value="">— elige jugador —</option>
            {jugadoresQ.data?.map((j) => (
              <option key={j.id} value={j.id}>
                {j.numeroCamiseta ? `#${j.numeroCamiseta} ` : ''}
                {j.nombre} {j.apellido}
              </option>
            ))}
          </select>
          {form.formState.errors.jugadorInscritoId && (
            <p className="text-xs text-danger mt-1">{form.formState.errors.jugadorInscritoId.message}</p>
          )}
        </div>

        <Input
          label="Fechas de suspensión"
          type="number"
          min={1}
          max={20}
          {...form.register('fechasSuspension', { valueAsNumber: true })}
          error={form.formState.errors.fechasSuspension?.message}
        />
        <Input
          label="Desde fecha número (opcional)"
          type="number"
          min={1}
          placeholder="Próxima programada"
          {...form.register('desdeFechaNumero', { valueAsNumber: true })}
          error={form.formState.errors.desdeFechaNumero?.message}
        />

        <div className="md:col-span-2">
          <label className="label">Descripción / fundamento</label>
          <textarea
            className="input min-h-[80px]"
            placeholder="Ej. Agresión física a árbitro tras gol del rival, expulsión + 5 fechas. Fallo Tribunal 12/05/2026."
            {...form.register('descripcion')}
          />
          {form.formState.errors.descripcion && (
            <p className="text-xs text-danger mt-1">{form.formState.errors.descripcion.message}</p>
          )}
        </div>

        {/* Sprint 26H — Veto permanente desde el Tribunal */}
        <div className="md:col-span-2 border border-danger/30 rounded-card p-3 bg-danger/5">
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              {...form.register('vetoPermanente')}
              className="mt-1"
            />
            <div className="text-sm">
              <div className="font-semibold text-danger">
                Vetar de por vida (expulsión definitiva)
              </div>
              <div className="text-xs text-ink-mute mt-0.5 font-serif italic">
                Además de la suspensión por fechas, agrega el RUT del jugador
                a la lista negra de la liga. No podrá ser fichado por ningún
                club en ningún torneo futuro. Usalo solo para sanciones graves
                (agresión física, falsificación, etc).
              </div>
            </div>
          </label>
        </div>

        {error && (
          <div className="md:col-span-2 text-sm text-danger bg-danger/10 px-3 py-2 rounded-card">
            {error.message}
          </div>
        )}

        <div className="md:col-span-2 flex gap-2">
          <Button type="submit" variant="accent" loading={mutation.isPending}>
            <Gavel size={14} /> {esCierre ? 'Registrar resolución' : 'Imponer sanción'}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
