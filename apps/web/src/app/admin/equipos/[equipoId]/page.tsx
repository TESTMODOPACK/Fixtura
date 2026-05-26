'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Save, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import type { JugadorAdmin } from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHead } from '@/components/ui/page-head';
import { useCreateJugador, useJugadores } from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

const POSICIONES = [
  { value: 'ARQUERO', label: 'Arquero', emoji: '🥅' },
  { value: 'DEFENSA', label: 'Defensa', emoji: '🛡️' },
  { value: 'MEDIO', label: 'Mediocampo', emoji: '🎯' },
  { value: 'DELANTERO', label: 'Delantero', emoji: '⚽' },
] as const;

export default function EquipoDetallePage({
  params,
}: {
  params: { equipoId: string };
}): React.ReactElement {
  const { equipoId } = params;
  const { data: jugadores, isLoading } = useJugadores(equipoId);
  const [adding, setAdding] = useState(false);

  return (
    <>
      <PageHead
        eyebrow="Equipo · Plantilla"
        title="Plantilla del equipo"
        sub="Inscribí los jugadores que van a participar en el torneo. Podés cargarlos uno por uno o en bulk desde CSV (próximamente)."
      >
        <Link href="/admin/torneos">
          <Button variant="default" size="sm">
            <ArrowLeft size={14} /> Torneos
          </Button>
        </Link>
      </PageHead>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card padding="none" className="lg:col-span-2 overflow-hidden">
          <div className="px-5 py-3 border-b border-line flex items-center justify-between">
            <div>
              <CardLabel>Jugadores inscritos</CardLabel>
              <div className="font-display text-xl text-green-deep tracking-display">
                {isLoading ? '…' : `${jugadores?.length ?? 0} JUGADORES`}
              </div>
            </div>
            <Button variant="accent" size="sm" onClick={() => setAdding((v) => !v)}>
              <UserPlus size={14} /> {adding ? 'Cancelar' : 'Agregar jugador'}
            </Button>
          </div>

          {adding && (
            <div className="px-5 py-4 bg-paper-dark border-b border-line">
              <NuevoJugadorForm equipoId={equipoId} onDone={() => setAdding(false)} />
            </div>
          )}

          {isLoading && (
            <div className="p-6 font-serif italic text-ink-mute">Cargando plantilla...</div>
          )}

          {!isLoading && jugadores && jugadores.length === 0 && !adding && (
            <div className="p-12 text-center">
              <UserPlus size={36} className="mx-auto text-line mb-3" />
              <p className="font-serif italic text-ink-mute">
                Todavía no hay jugadores inscritos. Agregá el primero para empezar.
              </p>
            </div>
          )}

          {jugadores && jugadores.length > 0 && <JugadoresTable jugadores={jugadores} />}
        </Card>

        <Card variant="lime" padding="comfortable">
          <CardLabel tone="mute">Plantilla mínima</CardLabel>
          <div className="font-display text-lg text-green-deep tracking-display mb-2">
            CHECKLIST ANFA
          </div>
          <ul className="space-y-2 text-sm text-green-deep/85">
            <li>• Mínimo 1 arquero</li>
            <li>• Mínimo 11 titulares en cancha</li>
            <li>• Capitán designado (banda)</li>
            <li>• Número de camiseta único por equipo</li>
            <li>• RUT registrado para sanciones por acumulación</li>
          </ul>
          <p className="font-serif italic text-xs text-green-deep/70 mt-4">
            El RUT es lo que permite que la sanción por amarillas siga al jugador si cambia de club
            dentro del mismo torneo.
          </p>
        </Card>
      </div>
    </>
  );
}

function JugadoresTable({ jugadores }: { jugadores: JugadorAdmin[] }): React.ReactElement {
  const porPosicion = {
    ARQUERO: jugadores.filter((j) => j.posicion === 'ARQUERO'),
    DEFENSA: jugadores.filter((j) => j.posicion === 'DEFENSA'),
    MEDIO: jugadores.filter((j) => j.posicion === 'MEDIO'),
    DELANTERO: jugadores.filter((j) => j.posicion === 'DELANTERO'),
    SIN_POSICION: jugadores.filter((j) => !j.posicion),
  };

  return (
    <div className="divide-y divide-line">
      {POSICIONES.map((pos) => {
        const jugs = porPosicion[pos.value as keyof typeof porPosicion] ?? [];
        if (jugs.length === 0) return null;
        return (
          <div key={pos.value}>
            <div className="px-5 py-2 bg-paper text-[10px] uppercase tracking-[0.18em] font-semibold text-ink-mute flex items-center gap-2">
              <span>{pos.emoji}</span> {pos.label} · {jugs.length}
            </div>
            {jugs.map((j) => (
              <JugadorRow key={j.id} jugador={j} />
            ))}
          </div>
        );
      })}
      {porPosicion.SIN_POSICION.length > 0 && (
        <div>
          <div className="px-5 py-2 bg-paper text-[10px] uppercase tracking-[0.18em] font-semibold text-ink-mute">
            Sin posición · {porPosicion.SIN_POSICION.length}
          </div>
          {porPosicion.SIN_POSICION.map((j) => (
            <JugadorRow key={j.id} jugador={j} />
          ))}
        </div>
      )}
    </div>
  );
}

function JugadorRow({ jugador }: { jugador: JugadorAdmin }): React.ReactElement {
  return (
    <div className="px-5 py-3 flex items-center gap-4">
      <div
        className={cn(
          'w-9 h-9 rounded-full flex items-center justify-center font-mono font-bold text-sm flex-shrink-0',
          jugador.capitan ? 'bg-accent text-chalk' : 'bg-paper-dark text-ink-mute',
        )}
      >
        {jugador.numeroCamiseta ?? '—'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm">
          {jugador.nombre} {jugador.apellido}
          {jugador.capitan && (
            <span className="ml-2 text-[10px] uppercase tracking-wider text-accent">capitán</span>
          )}
        </div>
        <div className="text-xs text-ink-mute">
          {jugador.apodo && <span>&ldquo;{jugador.apodo}&rdquo; · </span>}
          {jugador.rut ?? 'Sin RUT'}
        </div>
      </div>
      <div className="text-xs text-ink-mute font-mono">{jugador.pieHabil ?? ''}</div>
    </div>
  );
}

function NuevoJugadorForm({
  equipoId,
  onDone,
}: {
  equipoId: string;
  onDone: () => void;
}): React.ReactElement {
  const mutation = useCreateJugador(equipoId);

  const Schema = z.object({
    nombre: z.string().min(2).max(100),
    apellido: z.string().min(2).max(100),
    apodo: z.string().max(50).optional(),
    rut: z.string().max(20).optional(),
    numeroCamiseta: z.coerce.number().int().min(0).max(99).optional(),
    posicion: z.enum(['ARQUERO', 'DEFENSA', 'MEDIO', 'DELANTERO']).optional(),
    pieHabil: z.enum(['IZQUIERDO', 'DERECHO', 'AMBIDIESTRO']).optional(),
    capitan: z.boolean().default(false),
  });
  type Form = z.infer<typeof Schema>;

  const form = useForm<Form>({
    resolver: zodResolver(Schema),
    defaultValues: {
      nombre: '',
      apellido: '',
      apodo: '',
      rut: '',
      numeroCamiseta: undefined,
      posicion: undefined,
      pieHabil: undefined,
      capitan: false,
    },
  });

  const onSubmit = async (vals: Form): Promise<void> => {
    await mutation.mutateAsync({
      nombre: vals.nombre,
      apellido: vals.apellido,
      apodo: vals.apodo || null,
      rut: vals.rut || null,
      numeroCamiseta: vals.numeroCamiseta ?? null,
      posicion: vals.posicion ?? null,
      pieHabil: vals.pieHabil ?? null,
      capitan: vals.capitan,
    });
    form.reset();
    onDone();
  };

  const error = mutation.error as ApiError | undefined;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <Input label="Nombre" {...form.register('nombre')} error={form.formState.errors.nombre?.message} />
      <Input
        label="Apellido"
        {...form.register('apellido')}
        error={form.formState.errors.apellido?.message}
      />
      <Input label="Apodo (opcional)" {...form.register('apodo')} />

      <Input label="RUT" placeholder="12345678-9" {...form.register('rut')} />
      <Input
        label="Número de camiseta"
        type="number"
        min={0}
        max={99}
        {...form.register('numeroCamiseta', { valueAsNumber: true })}
      />
      <div>
        <label className="label">Posición</label>
        <select className="input" {...form.register('posicion')}>
          <option value="">—</option>
          <option value="ARQUERO">🥅 Arquero</option>
          <option value="DEFENSA">🛡️ Defensa</option>
          <option value="MEDIO">🎯 Medio</option>
          <option value="DELANTERO">⚽ Delantero</option>
        </select>
      </div>

      <div>
        <label className="label">Pie hábil</label>
        <select className="input" {...form.register('pieHabil')}>
          <option value="">—</option>
          <option value="DERECHO">Derecho</option>
          <option value="IZQUIERDO">Izquierdo</option>
          <option value="AMBIDIESTRO">Ambidiestro</option>
        </select>
      </div>
      <label className="flex items-center gap-2 mt-7">
        <input type="checkbox" {...form.register('capitan')} className="rounded" />
        <span className="text-sm">Capitán</span>
      </label>

      <div className="md:col-span-3 flex items-center gap-2">
        <Button type="submit" variant="accent" size="sm" loading={mutation.isPending}>
          <Save size={14} /> Inscribir jugador
        </Button>
        {error && <span className="text-xs text-danger">{error.message}</span>}
      </div>
    </form>
  );
}
