'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  AlertTriangle,
  CheckCircle2,
  Coins,
  CreditCard,
  DollarSign,
  Filter,
  PiggyBank,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import {
  CATEGORIA_COBRO,
  CATEGORIA_LABEL,
  METODO_LABEL,
  METODO_PAGO,
  type CategoriaCobro,
  type CobroAdmin,
  type MetodoPago,
} from '@fixtura/types';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHead } from '@/components/ui/page-head';
import {
  useCobros,
  useCreateCobro,
  useDeleteCobro,
  useIniciarPago,
  useMarcarPagado,
  useRevertirPago,
} from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

type Filtro = 'todos' | 'pendientes' | 'vencidos' | 'pagados' | 'cancelados';

const ESTADO_BADGE: Record<CobroAdmin['estado'], string> = {
  PENDIENTE: 'bg-orange-700/15 text-orange-700',
  VENCIDO: 'bg-danger/15 text-danger',
  PAGADO: 'bg-green-bright/15 text-green-bright',
  CANCELADO: 'bg-ink-mute/15 text-ink-mute',
};

const ESTADO_LABEL: Record<CobroAdmin['estado'], string> = {
  PENDIENTE: 'Pendiente',
  VENCIDO: 'Vencido',
  PAGADO: 'Pagado',
  CANCELADO: 'Cancelado',
};

function formatCLP(n: number): string {
  return `$${n.toLocaleString('es-CL')}`;
}

export default function FinanzasPage(): React.ReactElement {
  const [filtro, setFiltro] = useState<Filtro>('pendientes');
  const [adding, setAdding] = useState(false);
  const { data: cobros, isLoading, error } = useCobros(filtro === 'todos' ? undefined : filtro);
  const apiError = error as ApiError | undefined;

  const stats = useMemo(() => {
    const all = cobros ?? [];
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);

    const cobradoMes = all
      .filter((c) => c.pagadoAt && new Date(c.pagadoAt).getTime() >= inicioMes.getTime())
      .reduce((acc, c) => acc + c.monto, 0);
    const pendienteTotal = all
      .filter((c) => c.estado === 'PENDIENTE' || c.estado === 'VENCIDO')
      .reduce((acc, c) => acc + c.monto, 0);
    const morosos = all.filter((c) => c.estado === 'VENCIDO').length;
    return {
      total: all.length,
      cobradoMes,
      pendienteTotal,
      morosos,
    };
  }, [cobros]);

  return (
    <>
      <PageHead
        eyebrow="Operaciones"
        title="Finanzas & cobros"
        sub="Registro manual de inscripciones, cuotas, multas y alquileres. Cuando llegue el pago, lo marcás aquí para mantener trazabilidad."
      >
        <Button variant="accent" size="sm" onClick={() => setAdding((v) => !v)}>
          <Plus size={14} /> {adding ? 'Cancelar' : 'Nuevo cobro'}
        </Button>
      </PageHead>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card padding="comfortable">
          <CardLabel>Visibles</CardLabel>
          <div className="font-display text-3xl text-green-deep tracking-display">
            {isLoading ? '…' : stats.total}
          </div>
        </Card>
        <Card padding="comfortable">
          <CardLabel>Cobrado este mes</CardLabel>
          <div className="font-display text-3xl text-green-bright tracking-display">
            {isLoading ? '…' : formatCLP(stats.cobradoMes)}
          </div>
        </Card>
        <Card padding="comfortable">
          <CardLabel>Pendiente</CardLabel>
          <div
            className={cn(
              'font-display text-3xl tracking-display',
              stats.pendienteTotal > 0 ? 'text-orange-700' : 'text-green-bright',
            )}
          >
            {isLoading ? '…' : formatCLP(stats.pendienteTotal)}
          </div>
        </Card>
        <Card padding="comfortable">
          <CardLabel>Morosos</CardLabel>
          <div
            className={cn(
              'font-display text-3xl tracking-display',
              stats.morosos > 0 ? 'text-danger' : 'text-green-bright',
            )}
          >
            {isLoading ? '…' : stats.morosos}
          </div>
          <div className="text-xs text-ink-mute font-serif italic mt-1">Cobros vencidos</div>
        </Card>
      </div>

      {adding && (
        <Card padding="comfortable" className="mb-5">
          <CobroForm onDone={() => setAdding(false)} />
        </Card>
      )}

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Filter size={14} className="text-ink-mute" />
        {(['pendientes', 'vencidos', 'pagados', 'cancelados', 'todos'] as Filtro[]).map(
          (f) => (
            <FiltroChip key={f} active={filtro === f} onClick={() => setFiltro(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </FiltroChip>
          ),
        )}
      </div>

      {apiError && (
        <Card padding="comfortable" className="border-2 border-danger/40 bg-danger/5 mb-4">
          <div className="flex items-start gap-3 text-danger">
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">No pudimos cargar los cobros</div>
              <div className="text-sm mt-1">{apiError.message}</div>
            </div>
          </div>
        </Card>
      )}

      <Card padding="none" className="overflow-hidden">
        {isLoading && (
          <div className="p-8 text-center font-serif italic text-ink-mute">Cargando…</div>
        )}
        {!isLoading && !apiError && (cobros?.length ?? 0) === 0 && (
          <div className="p-12 text-center">
            <PiggyBank size={36} className="mx-auto text-line mb-3" />
            <p className="font-serif italic text-ink-mute">
              No hay cobros{filtro !== 'todos' ? ` en estado "${filtro}"` : ''}.
            </p>
          </div>
        )}
        {!isLoading && cobros && cobros.length > 0 && (
          <div className="divide-y divide-line">
            {cobros.map((c) => (
              <CobroRow key={c.id} cobro={c} />
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

function CobroRow({ cobro }: { cobro: CobroAdmin }): React.ReactElement {
  const remove = useDeleteCobro();
  const revertir = useRevertirPago();
  const iniciarPago = useIniciarPago();
  const [pagando, setPagando] = useState(false);
  const iniciarError = iniciarPago.error as ApiError | undefined;

  const onPagarOnline = async (): Promise<void> => {
    const res = await iniciarPago.mutateAsync({ cobroId: cobro.id });
    // Redirigir al user a la pasarela. En modo MOCK, la "pasarela" es
    // nuestra propia página de retorno con un token simulado — el user
    // ve el flujo end-to-end igual que con Webpay real.
    if (typeof window !== 'undefined') {
      window.location.href = res.urlRedireccion;
    }
  };

  return (
    <div className="p-5">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-semibold text-ink">{cobro.concepto}</span>
            <span
              className={cn(
                'text-[10px] uppercase tracking-[0.18em] font-semibold px-2 py-1 rounded',
                ESTADO_BADGE[cobro.estado],
              )}
            >
              {ESTADO_LABEL[cobro.estado]}
            </span>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-ink-mute">
              {CATEGORIA_LABEL[cobro.categoria]}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-ink-mute flex-wrap">
            <span className="font-display tracking-display text-2xl text-green-deep">
              {formatCLP(cobro.monto)}
            </span>
            {cobro.equipoNombre && <span>· {cobro.equipoNombre}</span>}
            {cobro.vencimiento && (
              <span>
                Vence: <span className="font-mono">{cobro.vencimiento}</span>
              </span>
            )}
            {cobro.pagadoAt && (
              <span className="text-green-bright">
                Pagado el{' '}
                <span className="font-mono">
                  {new Date(cobro.pagadoAt).toLocaleDateString('es-CL')}
                </span>
                {cobro.pagadoMetodo && ` · ${METODO_LABEL[cobro.pagadoMetodo]}`}
                {cobro.pagadoReferencia && ` · ref: ${cobro.pagadoReferencia}`}
              </span>
            )}
          </div>
          {cobro.notas && (
            <div className="mt-1 text-xs text-ink-mute font-serif italic truncate">
              {cobro.notas}
            </div>
          )}

          {pagando && (
            <div className="mt-3">
              <MarcarPagadoForm
                cobroId={cobro.id}
                onDone={() => setPagando(false)}
              />
            </div>
          )}

          {iniciarError && (
            <div className="mt-2 text-xs text-danger bg-danger/10 px-2 py-1 rounded">
              No pudimos iniciar el pago online: {iniciarError.message}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {cobro.estado === 'PENDIENTE' || cobro.estado === 'VENCIDO' ? (
            <>
              <button
                type="button"
                onClick={onPagarOnline}
                disabled={iniciarPago.isPending}
                className="px-2 py-1 rounded text-xs uppercase tracking-wider font-semibold bg-green-deep text-chalk hover:bg-green-deep/90 disabled:opacity-50"
                title="Pagar online por Webpay"
              >
                <CreditCard size={12} className="inline mr-1" />
                {iniciarPago.isPending ? 'Redirigiendo…' : 'Pagar online'}
              </button>
              <button
                type="button"
                onClick={() => setPagando((v) => !v)}
                className="px-2 py-1 rounded text-xs uppercase tracking-wider font-semibold bg-accent text-chalk hover:bg-accent/90"
                title="Marcar como pagado manualmente (efectivo, transferencia)"
              >
                <Coins size={12} className="inline mr-1" /> Manual
              </button>
            </>
          ) : null}
          {cobro.estado === 'PAGADO' && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`¿Revertir el pago de "${cobro.concepto}"?`)) {
                  revertir.mutate(cobro.id);
                }
              }}
              className="p-1 rounded text-ink-mute hover:text-orange-700 hover:bg-orange-700/10"
              title="Revertir pago"
            >
              <RotateCcw size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  `¿Eliminar el cobro "${cobro.concepto}"? Esta acción no se puede deshacer.`,
                )
              ) {
                remove.mutate(cobro.id);
              }
            }}
            className="p-1 rounded text-ink-mute hover:text-danger hover:bg-danger/10"
            title="Eliminar"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function CobroForm({ onDone }: { onDone: () => void }): React.ReactElement {
  const create = useCreateCobro();
  const error = create.error as ApiError | undefined;

  const Schema = z.object({
    concepto: z.string().min(2).max(200),
    categoria: z.enum(CATEGORIA_COBRO),
    monto: z.coerce.number().int().min(0).max(100_000_000),
    vencimiento: z.string().optional(),
    notas: z.string().max(1000).optional(),
  });
  type Form = z.infer<typeof Schema>;

  const form = useForm<Form>({
    resolver: zodResolver(Schema),
    defaultValues: { categoria: 'CUOTA', monto: 0 },
  });

  const onSubmit = async (vals: Form): Promise<void> => {
    await create.mutateAsync({
      concepto: vals.concepto,
      categoria: vals.categoria,
      monto: vals.monto,
      vencimiento: vals.vencimiento || null,
      notas: vals.notas || null,
    });
    form.reset();
    onDone();
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <DollarSign size={18} className="text-accent" />
        <CardLabel>Nuevo cobro</CardLabel>
      </div>

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid grid-cols-1 md:grid-cols-2 gap-3"
      >
        <Input
          label="Concepto"
          placeholder="Inscripción Apertura 2026 — Halcones FC"
          {...form.register('concepto')}
          error={form.formState.errors.concepto?.message}
        />
        <div>
          <label className="label">Categoría</label>
          <select className="input" {...form.register('categoria')}>
            {CATEGORIA_COBRO.map((c) => (
              <option key={c} value={c}>
                {CATEGORIA_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <Input
          label="Monto (CLP)"
          type="number"
          min={0}
          step={1000}
          {...form.register('monto', { valueAsNumber: true })}
          error={form.formState.errors.monto?.message}
        />
        <Input
          label="Vencimiento (opcional)"
          type="date"
          {...form.register('vencimiento')}
        />
        <div className="md:col-span-2">
          <label className="label">Notas</label>
          <textarea
            className="input min-h-[60px]"
            placeholder="Ej: descuento por pago anticipado, factura emitida #123"
            {...form.register('notas')}
          />
        </div>

        {error && (
          <div className="md:col-span-2 text-sm text-danger bg-danger/10 px-3 py-2 rounded-card">
            {error.message}
          </div>
        )}

        <div className="md:col-span-2 flex gap-2">
          <Button type="submit" variant="accent" loading={create.isPending}>
            <Plus size={14} /> Crear cobro
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            <X size={14} /> Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}

function MarcarPagadoForm({
  cobroId,
  onDone,
}: {
  cobroId: string;
  onDone: () => void;
}): React.ReactElement {
  const marcar = useMarcarPagado();
  const error = marcar.error as ApiError | undefined;
  const [metodo, setMetodo] = useState<MetodoPago>('TRANSFERENCIA');
  const [referencia, setReferencia] = useState('');

  const submit = async (): Promise<void> => {
    await marcar.mutateAsync({
      id: cobroId,
      input: {
        metodo,
        referencia: referencia.trim() || null,
      },
    });
    onDone();
  };

  return (
    <div className="bg-paper border border-line rounded-card p-3 flex flex-wrap items-end gap-2">
      <div>
        <label className="label">Método</label>
        <select
          className="input"
          value={metodo}
          onChange={(e) => setMetodo(e.target.value as MetodoPago)}
        >
          {METODO_PAGO.map((m) => (
            <option key={m} value={m}>
              {METODO_LABEL[m]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex-1 min-w-[180px]">
        <label className="label">Referencia (opcional)</label>
        <input
          type="text"
          className="input"
          placeholder="N° transferencia / boleta"
          value={referencia}
          onChange={(e) => setReferencia(e.target.value)}
        />
      </div>
      <Button
        type="button"
        variant="accent"
        size="sm"
        onClick={submit}
        loading={marcar.isPending}
      >
        <CheckCircle2 size={14} /> Confirmar pago
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onDone}>
        <X size={14} />
      </Button>
      {error && (
        <div className="w-full text-sm text-danger mt-2">{error.message}</div>
      )}
    </div>
  );
}
