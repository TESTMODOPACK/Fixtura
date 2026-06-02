'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  Save,
  UploadCloud,
  UserPlus,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  formatearRut,
  validarRut,
  type CreateJugadorRequest,
  type JugadorAdmin,
} from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHead } from '@/components/ui/page-head';
import {
  useBulkCreateJugadores,
  useCreateJugador,
  useJugadores,
} from '@/hooks/use-admin';
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
  const [importing, setImporting] = useState(false);

  return (
    <>
      <PageHead
        eyebrow="Equipo · Plantilla"
        title="Plantilla del equipo"
        sub="Inscribí los jugadores que van a participar en el torneo. Cargalos uno por uno o pegá la planilla desde Excel."
      >
        <Link href="/admin/torneos">
          <Button variant="default" size="sm">
            <ArrowLeft size={14} /> Torneos
          </Button>
        </Link>
      </PageHead>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card padding="none" className="lg:col-span-2 overflow-hidden">
          <div className="px-5 py-3 border-b border-line flex items-center justify-between gap-2 flex-wrap">
            <div>
              <CardLabel>Jugadores inscritos</CardLabel>
              <div className="font-display text-xl text-green-deep tracking-display">
                {isLoading ? '…' : `${jugadores?.length ?? 0} JUGADORES`}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  setImporting((v) => !v);
                  setAdding(false);
                }}
              >
                <FileSpreadsheet size={14} /> {importing ? 'Cancelar' : 'Importar CSV'}
              </Button>
              <Button
                variant="accent"
                size="sm"
                onClick={() => {
                  setAdding((v) => !v);
                  setImporting(false);
                }}
              >
                <UserPlus size={14} /> {adding ? 'Cancelar' : 'Agregar jugador'}
              </Button>
            </div>
          </div>

          {importing && (
            <div className="px-5 py-4 bg-paper-dark border-b border-line">
              <ImportCsvForm equipoId={equipoId} onDone={() => setImporting(false)} />
            </div>
          )}

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
          {jugador.edadCalendario != null && (
            <>
              {' · '}
              <span title="Edad calendario: años que cumple este año">
                {jugador.edadCalendario} años
              </span>
            </>
          )}
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
    rut: z
      .string()
      .max(20)
      .optional()
      .refine((v) => !v || validarRut(v), 'RUT inválido (verificá el dígito verificador)'),
    numeroCamiseta: z.coerce.number().int().min(0).max(99).optional(),
    posicion: z.enum(['ARQUERO', 'DEFENSA', 'MEDIO', 'DELANTERO']).optional(),
    pieHabil: z.enum(['IZQUIERDO', 'DERECHO', 'AMBIDIESTRO']).optional(),
    // Fecha nacimiento opcional para arrancar, pero será requerida cuando
    // se active el mantenedor de categorías (siguiente sprint). El input
    // valida que sea pasada (no fechas futuras) y razonablemente reciente
    // (post-1900) para atajar typos al cargar planteles.
    fechaNac: z
      .string()
      .optional()
      .refine(
        (v) => {
          if (!v) return true;
          const d = new Date(v + 'T00:00:00Z');
          if (Number.isNaN(d.getTime())) return false;
          if (d.getTime() > Date.now()) return false;
          if (d.getUTCFullYear() < 1900) return false;
          return true;
        },
        'Fecha de nacimiento inválida (debe ser pasada y posterior a 1900).',
      ),
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
      fechaNac: '',
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
      fechaNac: vals.fechaNac || null,
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

      <Input
        label="RUT"
        placeholder="12.345.678-9"
        {...form.register('rut', {
          onBlur: (e) => {
            const v = e.target.value as string;
            if (v && validarRut(v)) {
              form.setValue('rut', formatearRut(v), { shouldValidate: true });
            }
          },
        })}
        error={form.formState.errors.rut?.message}
      />
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

      <Input
        label="Fecha de nacimiento"
        type="date"
        max={new Date().toISOString().slice(0, 10)}
        {...form.register('fechaNac')}
        error={form.formState.errors.fechaNac?.message}
      />
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

// ─── Import CSV ──────────────────────────────────────────────────────
type FilaParseada = {
  raw: string;
  ok: boolean;
  jugador?: CreateJugadorRequest;
  errores?: string[];
};

function ImportCsvForm({
  equipoId,
  onDone,
}: {
  equipoId: string;
  onDone: () => void;
}): React.ReactElement {
  const [csv, setCsv] = useState('');
  const mutation = useBulkCreateJugadores(equipoId);
  const error = mutation.error as ApiError | undefined;

  const parsed = useMemo(() => parseCsv(csv), [csv]);
  const validos = parsed.filter((p) => p.ok);
  const invalidos = parsed.filter((p) => !p.ok);

  const handleFile = (file: File): void => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      setCsv(text);
    };
    reader.readAsText(file, 'utf-8');
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const enviar = async (): Promise<void> => {
    if (validos.length === 0) return;
    // El backend acepta hasta 50 por request — chunked si excede.
    const CHUNK = 50;
    for (let i = 0; i < validos.length; i += CHUNK) {
      const chunk = validos.slice(i, i + CHUNK);
      await mutation.mutateAsync({
        jugadores: chunk.map((p) => p.jugador!),
      });
    }
    setCsv('');
    onDone();
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <FileSpreadsheet size={18} className="text-accent" />
        <CardLabel>Importar plantilla desde planilla</CardLabel>
      </div>

      <div className="bg-paper border border-line rounded-card p-3 mb-3 text-xs text-ink-mute font-serif italic leading-relaxed">
        Columnas esperadas (cabecera obligatoria, separador <span className="font-mono">,</span> o{' '}
        <span className="font-mono">;</span>):
        <div className="font-mono not-italic text-ink mt-1 break-all">
          nombre,apellido,rut,numero,posicion,pie,fecha_nac,apodo,capitan
        </div>
        <div className="mt-1">
          Solo <span className="font-semibold">nombre</span> y{' '}
          <span className="font-semibold">apellido</span> son obligatorios. El resto pueden ir
          vacíos. <span className="font-mono">posicion</span> ∈ ARQUERO/DEFENSA/MEDIO/DELANTERO.
          <span className="font-mono"> pie</span> ∈ IZQUIERDO/DERECHO/AMBIDIESTRO.
          <span className="font-mono"> capitan</span> ∈ true/false/1/0.
        </div>
      </div>

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="border-2 border-dashed border-line rounded-card p-4 mb-3 text-center"
      >
        <UploadCloud size={20} className="mx-auto text-ink-mute mb-1" />
        <p className="text-xs text-ink-mute font-serif italic mb-2">
          Arrastrá el .csv aquí o seleccionalo
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
          className="text-xs"
        />
      </div>

      <label className="label">…o pegá el CSV directamente</label>
      <textarea
        className="input min-h-[140px] font-mono text-xs"
        placeholder={`nombre,apellido,rut,numero,posicion,pie,fecha_nac,apodo,capitan\nJuan,Pérez,12345678-9,10,DELANTERO,DERECHO,1995-04-22,,true\n...`}
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
      />

      {parsed.length > 0 && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1 text-green-bright font-semibold">
              <CheckCircle2 size={12} /> {validos.length} válidas
            </span>
            {invalidos.length > 0 && (
              <span className="flex items-center gap-1 text-danger font-semibold">
                <AlertTriangle size={12} /> {invalidos.length} con error
              </span>
            )}
          </div>

          {invalidos.length > 0 && (
            <div className="bg-danger/5 border border-danger/30 rounded-card p-2 max-h-40 overflow-auto">
              {invalidos.slice(0, 10).map((p, idx) => (
                <div key={idx} className="text-xs text-danger font-mono mb-1">
                  línea: {p.raw.slice(0, 80)} → {p.errores?.join('; ')}
                </div>
              ))}
              {invalidos.length > 10 && (
                <div className="text-xs text-ink-mute italic">
                  …{invalidos.length - 10} errores más
                </div>
              )}
            </div>
          )}

          {validos.length > 0 && (
            <div className="bg-paper border border-line rounded-card max-h-48 overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-paper-dark sticky top-0">
                  <tr className="text-left">
                    <th className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-ink-mute font-semibold">#</th>
                    <th className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-ink-mute font-semibold">Nombre</th>
                    <th className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-ink-mute font-semibold">Pos</th>
                    <th className="px-2 py-1.5 text-[10px] uppercase tracking-wider text-ink-mute font-semibold">Cap</th>
                  </tr>
                </thead>
                <tbody>
                  {validos.map((p, idx) => (
                    <tr key={idx} className="border-t border-line">
                      <td className="px-2 py-1 font-mono">{p.jugador?.numeroCamiseta ?? '—'}</td>
                      <td className="px-2 py-1">
                        {p.jugador?.nombre} {p.jugador?.apellido}
                        {p.jugador?.rut && (
                          <span className="text-ink-mute font-mono ml-1">· {p.jugador.rut}</span>
                        )}
                      </td>
                      <td className="px-2 py-1 text-[10px] uppercase">{p.jugador?.posicion ?? '—'}</td>
                      <td className="px-2 py-1">{p.jugador?.capitan ? '★' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-card mt-3">
          {error.message}
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <Button
          type="button"
          variant="accent"
          loading={mutation.isPending}
          disabled={validos.length === 0}
          onClick={enviar}
        >
          <UploadCloud size={14} /> Importar {validos.length > 0 ? `${validos.length} jugadores` : ''}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          <X size={14} /> Cancelar
        </Button>
      </div>
    </div>
  );
}

/**
 * Parser CSV simple — soporta separador `,` o `;`, header obligatoria,
 * filas con campos vacíos. No usa libs (vendría con `papaparse` pero
 * para este formato fijo no se justifica).
 */
function parseCsv(input: string): FilaParseada[] {
  // Quitar BOM UTF-8 que Excel pone al exportar (﻿ al inicio)
  const withoutBom = input.replace(/^﻿/, '');
  const trimmed = withoutBom.trim();
  if (!trimmed) return [];
  const lines = trimmed.split(/\r?\n/);
  if (lines.length < 2) return [];

  const headerLine = lines[0]!;
  const sep = headerLine.includes(';') ? ';' : ',';
  const headers = headerLine.split(sep).map((h) => h.trim().toLowerCase());

  const required = ['nombre', 'apellido'];
  const missingHeaders = required.filter((r) => !headers.includes(r));
  if (missingHeaders.length > 0) {
    return [
      {
        raw: headerLine,
        ok: false,
        errores: [`faltan columnas obligatorias: ${missingHeaders.join(', ')}`],
      },
    ];
  }

  const idx = (col: string): number => headers.indexOf(col);
  const POS_VALIDOS = ['ARQUERO', 'DEFENSA', 'MEDIO', 'DELANTERO'];
  const PIE_VALIDOS = ['IZQUIERDO', 'DERECHO', 'AMBIDIESTRO'];

  return lines.slice(1).map((line) => {
    if (!line.trim()) {
      return { raw: line, ok: false, errores: ['línea vacía'] };
    }
    const cols = line.split(sep).map((c) => c.trim());

    const errores: string[] = [];
    const nombre = cols[idx('nombre')] ?? '';
    const apellido = cols[idx('apellido')] ?? '';
    if (nombre.length < 2) errores.push('nombre muy corto');
    if (apellido.length < 2) errores.push('apellido muy corto');

    const rutRaw = idx('rut') >= 0 ? (cols[idx('rut')] ?? '') : '';
    if (rutRaw && !validarRut(rutRaw)) {
      errores.push(`RUT inválido: ${rutRaw}`);
    }
    const rutFormateado = rutRaw && validarRut(rutRaw) ? formatearRut(rutRaw) : rutRaw;
    const numRaw = idx('numero') >= 0 ? (cols[idx('numero')] ?? '') : '';
    const numero = numRaw ? Number(numRaw) : null;
    if (numRaw && (Number.isNaN(numero) || (numero as number) < 0 || (numero as number) > 99)) {
      errores.push('numero camiseta inválido');
    }

    const posRaw = idx('posicion') >= 0 ? (cols[idx('posicion')] ?? '').toUpperCase() : '';
    const posicion = posRaw
      ? POS_VALIDOS.includes(posRaw)
        ? (posRaw as CreateJugadorRequest['posicion'])
        : null
      : null;
    if (posRaw && !posicion) errores.push(`posicion inválida: ${posRaw}`);

    const pieRaw = idx('pie') >= 0 ? (cols[idx('pie')] ?? '').toUpperCase() : '';
    const pieHabil = pieRaw
      ? PIE_VALIDOS.includes(pieRaw)
        ? (pieRaw as CreateJugadorRequest['pieHabil'])
        : null
      : null;
    if (pieRaw && !pieHabil) errores.push(`pie inválido: ${pieRaw}`);

    const fechaRaw = idx('fecha_nac') >= 0 ? (cols[idx('fecha_nac')] ?? '') : '';
    if (fechaRaw && !/^\d{4}-\d{2}-\d{2}$/.test(fechaRaw)) {
      errores.push('fecha_nac debe ser AAAA-MM-DD');
    }

    const apodo = idx('apodo') >= 0 ? (cols[idx('apodo')] ?? '') : '';
    const capRaw = idx('capitan') >= 0 ? (cols[idx('capitan')] ?? '').toLowerCase() : '';
    const capitan = capRaw === 'true' || capRaw === '1' || capRaw === 'sí' || capRaw === 'si';

    if (errores.length > 0) {
      return { raw: line, ok: false, errores };
    }

    return {
      raw: line,
      ok: true,
      jugador: {
        nombre,
        apellido,
        rut: rutFormateado || null,
        numeroCamiseta: numRaw ? (numero as number) : null,
        posicion,
        pieHabil,
        fechaNac: fechaRaw || null,
        apodo: apodo || null,
        capitan,
      },
    };
  });
}
