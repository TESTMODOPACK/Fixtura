'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Plus, Save, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import {
  FormErrorBanner,
  FormErrorChip,
  rhfErrorsToBanner,
} from '@/components/ui/form-errors';
import { Input } from '@/components/ui/input';
import { PageHead } from '@/components/ui/page-head';
import { toastError, toastSuccess, toastWarning } from '@/lib/toast';
import {
  useCategorias,
  useCreateTemporada,
  useCreateTorneo,
  useTemporadas,
} from '@/hooks/use-admin';

/**
 * Sprint 26D — Crear torneo con multi-categoría/serie y configuración
 * de planilla.
 *
 * Bloques:
 *   1. Datos principales (nombre, slug, temporada, formato, ruedas).
 *   2. Sistema de puntos.
 *   3. Categorías y series del torneo (multi-fila con cupo de equipos).
 *   4. Planilla (tope de jugadores + refuerzos con fecha límite).
 */

const ComboSchema = z.object({
  // categoriaId vacío = fila incompleta (la filtramos al submit)
  categoriaId: z.string().optional(),
  serieSlug: z.string().optional(),
  cupoEquipos: z.coerce.number().int().min(1).max(100),
});

// Sprint 27 — mapeo nombre técnico → etiqueta humana para el banner.
const TORNEO_FIELD_LABEL: Record<string, string> = {
  temporadaId: 'Temporada',
  nombre: 'Nombre',
  slug: 'Slug',
  tipoFormato: 'Tipo de formato',
  ruedas: 'Ruedas',
  puntosVictoria: 'Puntos por victoria',
  puntosEmpate: 'Puntos por empate',
  puntosDerrota: 'Puntos por derrota',
  topeJugadoresPorEquipo: 'Tope de jugadores',
  refuerzosHabilitados: 'Refuerzos',
  fechaLimiteRefuerzosNumero: 'Cierre de refuerzos',
  duracionPeriodoMinutos: 'Minutos por tiempo',
  duracionEntretiempoMinutos: 'Minutos de entretiempo',
  minJugadoresParaIniciar: 'Mínimo de jugadores para iniciar',
};

const TorneoFormSchema = z.object({
  temporadaId: z.union([z.literal(''), z.uuid('Elegí una temporada válida')]),
  nombre: z.string().min(2, 'Mínimo 2 caracteres').max(200),
  slug: z
    .string()
    .min(3, 'Mínimo 3 caracteres')
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones'),
  tipoFormato: z.enum(['ROUND_ROBIN', 'PLAYOFFS', 'GROUPS', 'MIXTO']),
  ruedas: z.union([z.literal(1), z.literal(2)]),
  puntosVictoria: z.coerce.number().int().min(0).max(10),
  puntosEmpate: z.coerce.number().int().min(0).max(10),
  puntosDerrota: z.coerce.number().int().min(0).max(10),
  // Sprint 26D
  categoriasSeries: z.array(ComboSchema),
  topeJugadoresPorEquipo: z.coerce.number().int().min(1).max(99),
  refuerzosHabilitados: z.boolean(),
  fechaLimiteRefuerzosNumero: z
    .union([z.coerce.number().int().min(0).max(99), z.literal('')])
    .optional(),
  // Sprint 29A — duración del partido configurable por torneo.
  duracionPeriodoMinutos: z.coerce.number().int().min(1).max(120),
  duracionEntretiempoMinutos: z.coerce.number().int().min(0).max(60),
  // F46.3 — mínimo de jugadores en planilla por equipo para iniciar.
  minJugadoresParaIniciar: z.coerce.number().int().min(1).max(30),
});
type TorneoForm = z.infer<typeof TorneoFormSchema>;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export default function NuevoTorneoPage(): React.ReactElement {
  const router = useRouter();
  const { data: temporadas, isLoading: loadingTemporadas } = useTemporadas();
  const { data: categorias } = useCategorias();
  const createTemporada = useCreateTemporada();
  const createTorneo = useCreateTorneo();
  const errorBannerRef = useRef<HTMLDivElement | null>(null);

  const form = useForm<TorneoForm>({
    resolver: zodResolver(TorneoFormSchema),
    defaultValues: {
      temporadaId: '',
      nombre: '',
      slug: '',
      tipoFormato: 'ROUND_ROBIN',
      ruedas: 1,
      puntosVictoria: 3,
      puntosEmpate: 1,
      puntosDerrota: 0,
      categoriasSeries: [],
      topeJugadoresPorEquipo: 25,
      refuerzosHabilitados: true,
      fechaLimiteRefuerzosNumero: '' as unknown as number,
      duracionPeriodoMinutos: 40,
      duracionEntretiempoMinutos: 10,
      minJugadoresParaIniciar: 7,
    },
    mode: 'onChange',
  });

  const {
    fields: combosFields,
    append: appendCombo,
    remove: removeCombo,
  } = useFieldArray({ control: form.control, name: 'categoriasSeries' });

  const nombre = form.watch('nombre');
  useEffect(() => {
    const slugTocado = form.formState.dirtyFields.slug === true;
    if (!slugTocado) {
      const auto = slugify(nombre);
      if (auto !== form.getValues('slug')) {
        form.setValue('slug', auto, { shouldValidate: true, shouldDirty: false });
      }
    }
  }, [nombre, form]);

  // Pre-seleccionar primera temporada cuando carguen
  useEffect(() => {
    if (temporadas && temporadas.length > 0 && !form.getValues('temporadaId')) {
      form.setValue('temporadaId', temporadas[0]!.id);
    }
  }, [temporadas, form]);

  const refuerzosHabilitados = form.watch('refuerzosHabilitados');

  const ensureTemporadaActual = async (): Promise<string> => {
    if (temporadas && temporadas.length > 0) return temporadas[0]!.id;
    const anioActual = new Date().getFullYear();
    const t = await createTemporada.mutateAsync({
      nombre: `Temporada ${anioActual}`,
      anio: anioActual,
    });
    return t.id;
  };

  const onSubmit = async (vals: TorneoForm): Promise<void> => {
    // Try/catch obligatorio: react-hook-form se traga las excepciones
    // de los submit async, asi que sin esto un fallo de mutateAsync
    // queda invisible (banner + toast).
    try {
      let temporadaId = vals.temporadaId;
      if (!temporadaId) temporadaId = await ensureTemporadaActual();

      // Filtrar combos incompletos (sin categoría)
      const categoriasSeries = vals.categoriasSeries
        .filter((c) => c.categoriaId)
        .map((c) => ({
          categoriaId: c.categoriaId!,
          serieSlug: c.serieSlug ? c.serieSlug : null,
          cupoEquipos: c.cupoEquipos,
        }));

      const fechaLimite =
        typeof vals.fechaLimiteRefuerzosNumero === 'number'
          ? vals.fechaLimiteRefuerzosNumero
          : null;

      const torneo = await createTorneo.mutateAsync({
      temporadaId,
      nombre: vals.nombre,
      slug: vals.slug,
      tipoFormato: vals.tipoFormato,
      ruedas: vals.ruedas,
      puntosVictoria: vals.puntosVictoria,
      puntosEmpate: vals.puntosEmpate,
      puntosDerrota: vals.puntosDerrota,
      categoriasSeries,
      topeJugadoresPorEquipo: vals.topeJugadoresPorEquipo,
      refuerzosHabilitados: vals.refuerzosHabilitados,
      fechaLimiteRefuerzosNumero: vals.refuerzosHabilitados ? fechaLimite : null,
      duracionPeriodoMinutos: vals.duracionPeriodoMinutos,
      duracionEntretiempoMinutos: vals.duracionEntretiempoMinutos,
      minJugadoresParaIniciar: vals.minJugadoresParaIniciar,
    });
      // Sprint 42 — Si el form tenía N combos (>=2), el backend creó N
      // torneos. La respuesta solo trae el primero, así que mostramos
      // un toast con el conteo y redirigimos al listado para que el
      // user vea a todos juntos.
      if (categoriasSeries.length >= 2) {
        toastSuccess(
          `${categoriasSeries.length} torneos creados (uno por categoría/serie).`,
        );
        router.push('/admin/torneos');
      } else {
        toastSuccess(`Torneo "${torneo.nombre}" creado correctamente.`);
        router.push(`/admin/torneos/${torneo.id}`);
      }
    } catch (err) {
      toastError(err);
      // El banner arriba tambien muestra el error via createTorneo.error;
      // hacemos scroll al banner para que sea visible si está fuera del fold.
      if (errorBannerRef.current) {
        errorBannerRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }
  };

  const onError = (errors: Record<string, unknown>): void => {
    // eslint-disable-next-line no-console
    console.warn('[nuevo-torneo] validación falló:', errors);
    // Sprint 30 fix — si el banner no captura los errores (FieldArray
    // sin .message a primer nivel, race con setValue, etc.) damos
    // feedback explícito con un toast para que el botón nunca parezca
    // "muerto".
    const flat = rhfErrorsToBanner(errors, TORNEO_FIELD_LABEL);
    if (flat.length > 0) {
      toastWarning(
        `Revisá los campos: ${flat
          .slice(0, 3)
          .map((e) => e.label)
          .join(', ')}${flat.length > 3 ? '…' : ''}`,
      );
    } else {
      toastWarning('Hay errores en el formulario. Revisá los campos marcados.');
    }
    if (errorBannerRef.current) {
      errorBannerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const apiError = createTorneo.error ?? createTemporada.error;
  const fieldErrors = rhfErrorsToBanner(
    form.formState.errors as Record<string, { message?: string } | undefined>,
    TORNEO_FIELD_LABEL,
  );

  const categoriasActivas = categorias?.filter((c) => c.activa) ?? [];

  return (
    <>
      <PageHead
        eyebrow="Competición · Crear torneo"
        title="Nuevo torneo"
        sub="Configurá los parámetros del torneo, las categorías que va a tener con su cupo de equipos, y el tope de jugadores por planilla."
      >
        <Link href="/admin/torneos">
          <Button variant="default" size="sm">
            <ArrowLeft size={14} /> Cancelar
          </Button>
        </Link>
      </PageHead>

      <FormErrorBanner
        ref={errorBannerRef}
        fieldErrors={fieldErrors}
        apiError={apiError}
        apiTitle="No se pudo crear el torneo"
        validationTitle="Revisá los campos marcados antes de crear el torneo:"
      />

      <form
        onSubmit={form.handleSubmit(onSubmit, onError)}
        className="grid grid-cols-1 lg:grid-cols-3 gap-5"
      >
        {/* Bloque 1: Datos principales */}
        <Card padding="roomy" className="lg:col-span-2">
          <CardLabel>Datos principales</CardLabel>
          <div className="space-y-4 mt-4">
            <Input
              label="Nombre del torneo"
              placeholder="Apertura 2026"
              autoFocus
              {...form.register('nombre')}
              error={form.formState.errors.nombre?.message}
            />
            <div>
              <Input
                label="Slug (URL)"
                placeholder="apertura-2026"
                {...form.register('slug')}
                error={form.formState.errors.slug?.message}
              />
              <p className="text-xs text-ink-mute font-serif italic mt-1">
                Se autocompleta desde el nombre.
              </p>
            </div>
            <div>
              <label className="label">Temporada</label>
              {loadingTemporadas ? (
                <div className="font-serif italic text-ink-mute text-sm py-2">
                  Cargando…
                </div>
              ) : temporadas && temporadas.length > 0 ? (
                <select className="input" {...form.register('temporadaId')}>
                  {temporadas.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre} ({t.anio})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-sm text-ink-mute font-serif italic">
                  No tenés temporadas. Creamos una automáticamente al guardar.
                </div>
              )}
            </div>
            <div>
              <label className="label">Formato</label>
              <select className="input" {...form.register('tipoFormato')}>
                <option value="ROUND_ROBIN">Round Robin (todos contra todos)</option>
                <option value="PLAYOFFS" disabled>Playoffs (próximo)</option>
                <option value="GROUPS" disabled>Grupos (próximo)</option>
                <option value="MIXTO" disabled>Mixto (próximo)</option>
              </select>
            </div>
            <div>
              <label className="label">Ruedas</label>
              <select
                className="input"
                {...form.register('ruedas', { valueAsNumber: true })}
              >
                <option value={1}>1 — solo ida</option>
                <option value={2}>2 — ida y vuelta</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Bloque 2: Sistema de puntos */}
        <Card padding="roomy">
          <CardLabel>Sistema de puntos</CardLabel>
          <div className="space-y-4 mt-4">
            <Input
              label="Por victoria"
              type="number"
              min={0}
              max={10}
              {...form.register('puntosVictoria', { valueAsNumber: true })}
            />
            <Input
              label="Por empate"
              type="number"
              min={0}
              max={10}
              {...form.register('puntosEmpate', { valueAsNumber: true })}
            />
            <Input
              label="Por derrota"
              type="number"
              min={0}
              max={10}
              {...form.register('puntosDerrota', { valueAsNumber: true })}
            />
            <p className="font-serif italic text-xs text-ink-mute">
              Estándar: 3 / 1 / 0.
            </p>
          </div>
        </Card>

        {/* Bloque 3: Categorías y series del torneo */}
        <Card padding="roomy" className="lg:col-span-2">
          <div className="flex items-center justify-between mb-1">
            <CardLabel>Categorías y series del torneo</CardLabel>
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() =>
                appendCombo({
                  categoriaId: '',
                  serieSlug: '',
                  cupoEquipos: 8,
                })
              }
              disabled={categoriasActivas.length === 0}
            >
              <Plus size={12} /> Agregar
            </Button>
          </div>
          <p className="text-xs text-ink-mute font-serif italic mb-3">
            Definí qué categorías (y opcionalmente series) participan, con el
            cupo máximo de equipos de cada combo. Ej: Senior Primera = 10,
            Senior Segunda = 8.
          </p>

          {combosFields.length >= 2 && (
            <div className="mb-3 px-3 py-2 bg-accent/10 border border-accent/30 rounded text-xs text-ink">
              <strong>{combosFields.length} torneos se crearán</strong> al
              guardar — uno por cada combo, con el nombre y slug derivados.
              Cada torneo tendrá su propio fixture, tabla y configuración.
            </div>
          )}

          {categoriasActivas.length === 0 && (
            <div className="text-sm bg-accent/10 border border-accent/30 rounded-card p-3 text-ink">
              No hay categorías activas en la liga.{' '}
              <Link
                href="/admin/categorias"
                className="text-accent font-semibold hover:underline"
              >
                Crear categorías
              </Link>{' '}
              antes de configurar el torneo.
            </div>
          )}

          {combosFields.length === 0 && categoriasActivas.length > 0 && (
            <p className="text-xs font-serif italic text-ink-mute">
              Sin categorías agregadas. Si lo dejás vacío, el torneo no aplica
              regla de edad ni cupo por categoría (back-compat).
            </p>
          )}

          <div className="space-y-2">
            {combosFields.map((field, idx) => (
              <ComboRow
                key={field.id}
                form={form}
                idx={idx}
                onRemove={() => removeCombo(idx)}
                categorias={categoriasActivas}
              />
            ))}
          </div>
        </Card>

        {/* Bloque 4: Planilla y refuerzos */}
        <Card padding="roomy">
          <CardLabel>Planilla</CardLabel>
          <div className="space-y-4 mt-4">
            <Input
              label="Tope de jugadores por equipo"
              type="number"
              min={1}
              max={99}
              {...form.register('topeJugadoresPorEquipo', { valueAsNumber: true })}
            />
            <p className="text-xs font-serif italic text-ink-mute -mt-3">
              Máximo de jugadores fichados. El cupo en cancha lo controla el acta.
            </p>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                {...form.register('refuerzosHabilitados')}
              />
              Permitir refuerzos durante el torneo
            </label>

            {refuerzosHabilitados && (
              <Input
                label="Cierre de refuerzos (número de fecha del torneo)"
                type="number"
                min={0}
                max={99}
                placeholder="Sin límite"
                {...form.register('fechaLimiteRefuerzosNumero')}
              />
            )}
            {refuerzosHabilitados && (
              <p className="text-xs font-serif italic text-ink-mute -mt-3">
                Ej: 5 = hasta la fecha 5. Vacío = sin límite mientras haya cupo.
              </p>
            )}
          </div>
        </Card>

        {/* Bloque 5 (Sprint 29A): Duración del partido */}
        <Card padding="roomy">
          <CardLabel>Duración del partido</CardLabel>
          <p className="text-xs font-serif italic text-ink-mute mt-1 mb-4">
            Configura cuánto dura cada tiempo y el descanso. El match center y
            la vista pública en vivo van a usar estos valores.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Minutos por tiempo"
              type="number"
              min={1}
              max={120}
              {...form.register('duracionPeriodoMinutos', { valueAsNumber: true })}
            />
            <Input
              label="Minutos de entretiempo"
              type="number"
              min={0}
              max={60}
              {...form.register('duracionEntretiempoMinutos', { valueAsNumber: true })}
            />
            <Input
              label="Mínimo de jugadores para iniciar"
              type="number"
              min={1}
              max={30}
              {...form.register('minJugadoresParaIniciar', { valueAsNumber: true })}
            />
          </div>
          <p className="text-xs font-serif italic text-ink-mute mt-3">
            Default: 40 min por tiempo, 10 min de entretiempo (estándar amateur).
            El mínimo de jugadores (default 7) bloquea el inicio de un partido si
            algún equipo no tiene suficiente plantel registrado.
          </p>
        </Card>

        {/* Submit */}
        <div className="lg:col-span-3 flex items-center gap-3">
          <Button
            type="submit"
            variant="accent"
            loading={createTorneo.isPending || createTemporada.isPending}
          >
            <Save size={14} /> Crear torneo
          </Button>
          <Link href="/admin/torneos">
            <Button variant="ghost" size="sm">Cancelar</Button>
          </Link>
          {form.formState.isSubmitted && (
            <FormErrorChip
              fieldErrors={fieldErrors}
              hasApiError={apiError != null}
            />
          )}
        </div>
      </form>
    </>
  );
}

/**
 * Fila editable de (categoría, serie, cupo). Las series se derivan de
 * la categoría seleccionada en esta misma fila.
 */
function ComboRow({
  form,
  idx,
  onRemove,
  categorias,
}: {
  form: ReturnType<typeof useForm<TorneoForm>>;
  idx: number;
  onRemove: () => void;
  categorias: Array<{
    id: string;
    nombre: string;
    series: { slug: string; nombre: string; activa: boolean }[];
  }>;
}): React.ReactElement {
  const catId = form.watch(`categoriasSeries.${idx}.categoriaId`);
  const cat = categorias.find((c) => c.id === catId);
  const seriesActivas = cat?.series?.filter((s) => s.activa) ?? [];

  // Si la categoría cambia y la serie elegida ya no aplica, limpiarla.
  useEffect(() => {
    const serieActual = form.getValues(`categoriasSeries.${idx}.serieSlug`);
    if (!cat) {
      if (serieActual) {
        form.setValue(`categoriasSeries.${idx}.serieSlug`, '');
      }
      return;
    }
    if (
      serieActual &&
      !seriesActivas.some((s) => s.slug === serieActual)
    ) {
      form.setValue(`categoriasSeries.${idx}.serieSlug`, '');
    }
  }, [catId, cat, seriesActivas, idx, form]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_100px_auto] gap-2 items-start">
      <div>
        <select
          className="input"
          {...form.register(`categoriasSeries.${idx}.categoriaId` as const)}
        >
          <option value="">— Categoría —</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>
      <div>
        <select
          className="input disabled:opacity-50"
          disabled={!cat}
          {...form.register(`categoriasSeries.${idx}.serieSlug` as const)}
        >
          <option value="">— Sin serie —</option>
          {seriesActivas.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.nombre}
            </option>
          ))}
        </select>
      </div>
      <Input
        type="number"
        min={1}
        max={100}
        placeholder="Cupo"
        {...form.register(`categoriasSeries.${idx}.cupoEquipos` as const, {
          valueAsNumber: true,
        })}
      />
      <button
        type="button"
        onClick={onRemove}
        className="h-10 w-10 flex items-center justify-center rounded-card hover:bg-danger/10 text-danger"
        aria-label="Quitar combo"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
