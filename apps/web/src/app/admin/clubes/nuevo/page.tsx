'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, ArrowLeft, Plus, Save, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useFieldArray, useForm, type FieldErrors } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHead } from '@/components/ui/page-head';
import { useCategorias, useCreateClub } from '@/hooks/use-admin';
import { ApiError } from '@/lib/api';

/**
 * Sprint 26C — Crear nuevo club.
 *
 * Form único (sin wizard) con tres bloques:
 *   1. Identidad: nombre, slug, escudo, colores, página web.
 *   2. Categorías: multi-check de categorías activas de la liga.
 *   3. Directiva opcional: presidente + delegados (contactos sin login).
 *
 * Los jugadores NO se cargan acá — se hace en la ficha del club después
 * de crearlo. Razón: armar la plantilla suele requerir CSV o datos que
 * el admin no tiene a mano al momento de crear el club por primera vez.
 */

/**
 * Email opcional: si no hay texto (vacío o solo espacios) se envía como
 * undefined, si hay texto debe ser un email válido. El preprocess
 * normaliza el "" a undefined antes de validar, lo cual evita el
 * comportamiento de "vacío pasa pero pepe@ también".
 */
const optionalEmail = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.email('Email inválido — usá formato nombre@dominio.com').max(150).optional(),
);

const ContactoSchema = z.object({
  nombre: z.string().min(2, 'Mínimo 2 caracteres').max(150),
  email: optionalEmail,
  telefono: z.string().max(50).optional(),
});

const ClubFormSchema = z.object({
  nombre: z.string().min(2, 'Mínimo 2 caracteres').max(150),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Solo minúsculas, números y guiones'),
  escudoUrl: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^https?:\/\//.test(v),
      'Debe ser una URL completa (http:// o https://)',
    ),
  colorPrimario: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Formato hex #RRGGBB'),
  colorSecundario: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^#[0-9a-fA-F]{6}$/.test(v),
      'Formato hex #RRGGBB',
    ),
  paginaWeb: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^https?:\/\//.test(v),
      'Debe ser una URL completa (http:// o https://)',
    ),
  resena: z.string().max(2000).optional(),
  categoriaIds: z.array(z.string().uuid()).min(1, 'Elegí al menos una categoría'),
  presidenteNombre: z.string().max(150).optional(),
  presidenteEmail: optionalEmail,
  presidenteTelefono: z.string().max(50).optional(),
  delegados: z.array(ContactoSchema),
});
type ClubForm = z.infer<typeof ClubFormSchema>;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Labels legibles para mostrar errores de validación al usuario.
const FIELD_LABEL: Record<string, string> = {
  nombre: 'Nombre',
  slug: 'Slug',
  escudoUrl: 'URL del escudo',
  colorPrimario: 'Color primario',
  colorSecundario: 'Color secundario',
  paginaWeb: 'Página web',
  resena: 'Reseña',
  categoriaIds: 'Categorías',
  presidenteNombre: 'Nombre del presidente',
  presidenteEmail: 'Email del presidente',
  presidenteTelefono: 'Teléfono del presidente',
  delegados: 'Delegados',
  historialManual: 'Historial',
};

export default function NuevoClubPage(): React.ReactElement {
  const router = useRouter();
  const { data: categorias, isLoading: loadingCats } = useCategorias();
  const createClub = useCreateClub();
  const errorBannerRef = useRef<HTMLDivElement | null>(null);

  const form = useForm<ClubForm>({
    resolver: zodResolver(ClubFormSchema),
    defaultValues: {
      nombre: '',
      slug: '',
      escudoUrl: '',
      colorPrimario: '#1B4332',
      colorSecundario: '',
      paginaWeb: '',
      resena: '',
      categoriaIds: [],
      presidenteNombre: '',
      presidenteEmail: '',
      presidenteTelefono: '',
      delegados: [],
    },
    mode: 'onChange',
  });
  const { fields: delegadosFields, append: appendDelegado, remove: removeDelegado } =
    useFieldArray({ control: form.control, name: 'delegados' });

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

  const categoriasSelected = form.watch('categoriaIds');

  const toggleCategoria = (id: string): void => {
    const current = form.getValues('categoriaIds');
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    form.setValue('categoriaIds', next, { shouldValidate: true, shouldDirty: true });
  };

  const onSubmit = async (vals: ClubForm): Promise<void> => {
    const presidente =
      vals.presidenteNombre && vals.presidenteNombre.trim().length > 0
        ? {
            nombre: vals.presidenteNombre.trim(),
            email: vals.presidenteEmail?.trim() || null,
            telefono: vals.presidenteTelefono?.trim() || null,
          }
        : null;

    const club = await createClub.mutateAsync({
      slug: vals.slug,
      nombre: vals.nombre,
      escudoUrl: vals.escudoUrl?.trim() || null,
      colorPrimario: vals.colorPrimario,
      colorSecundario: vals.colorSecundario?.trim() || null,
      paginaWeb: vals.paginaWeb?.trim() || null,
      resena: vals.resena?.trim() || null,
      categoriaIds: vals.categoriaIds,
      presidente,
      delegados: vals.delegados
        .filter((d) => d.nombre.trim().length > 0)
        .map((d) => ({
          nombre: d.nombre.trim(),
          email: d.email?.trim() || null,
          telefono: d.telefono?.trim() || null,
        })),
    });
    router.push(`/admin/clubes/${club.id}`);
  };

  // Cuando handleSubmit detecta errores de validación, llama a onError
  // (en vez de onSubmit). Sin este handler, el botón "Crear club" parece
  // que no hace nada cuando hay un email mal formado u otro campo
  // inválido. Acá scrolleamos al banner para que el usuario vea qué falta.
  const onError = (errors: FieldErrors<ClubForm>): void => {
    // eslint-disable-next-line no-console
    console.warn('[nuevo-club] validación falló:', errors);
    if (errorBannerRef.current) {
      errorBannerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const apiError = createClub.error as ApiError | undefined;
  // Aplanamos los errores de zod a una lista plana para el banner.
  // delegados es un FieldArray — manejamos sus errores anidados aparte.
  const formErrors = form.formState.errors;
  const erroresParaMostrar: Array<{ label: string; mensaje: string }> = [];
  for (const [campo, err] of Object.entries(formErrors)) {
    if (campo === 'delegados') continue;
    const errObj = err as { message?: string } | undefined;
    if (errObj?.message) {
      erroresParaMostrar.push({
        label: FIELD_LABEL[campo] ?? campo,
        mensaje: errObj.message,
      });
    }
  }
  // Errores anidados de delegados (cada delegado tiene nombre/email/telefono)
  const delegadosErrors = formErrors.delegados as
    | Array<{ nombre?: { message?: string }; email?: { message?: string }; telefono?: { message?: string } }>
    | undefined;
  if (Array.isArray(delegadosErrors)) {
    delegadosErrors.forEach((dErr, i) => {
      if (dErr?.nombre?.message) {
        erroresParaMostrar.push({
          label: `Delegado #${i + 1} · nombre`,
          mensaje: dErr.nombre.message,
        });
      }
      if (dErr?.email?.message) {
        erroresParaMostrar.push({
          label: `Delegado #${i + 1} · email`,
          mensaje: dErr.email.message,
        });
      }
      if (dErr?.telefono?.message) {
        erroresParaMostrar.push({
          label: `Delegado #${i + 1} · teléfono`,
          mensaje: dErr.telefono.message,
        });
      }
    });
  }

  return (
    <>
      <PageHead
        eyebrow="Comunidad · Crear club"
        title="Nuevo club"
        sub="Cargá los datos del club. Después podés sumar la plantilla por categoría desde su ficha."
      >
        <Link href="/admin/clubes">
          <Button variant="default" size="sm">
            <ArrowLeft size={14} /> Cancelar
          </Button>
        </Link>
      </PageHead>

      {/* Banner unificado: errores del cliente (zod) Y errores del backend (apiError) */}
      {(erroresParaMostrar.length > 0 || apiError) && (
        <div
          ref={errorBannerRef}
          className="mb-5 bg-danger/10 border-2 border-danger/40 rounded-card px-4 py-3"
        >
          <div className="flex items-start gap-2 text-danger">
            <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
            <div className="text-sm flex-1">
              <div className="font-semibold">
                {apiError
                  ? 'No se pudo crear el club'
                  : 'Revisá los campos marcados antes de crear el club:'}
              </div>
              {apiError && <div className="mt-1">{apiError.message}</div>}
              {erroresParaMostrar.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {erroresParaMostrar.map((e, i) => (
                    <li key={i}>
                      <span className="font-semibold">{e.label}:</span> {e.mensaje}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <form
        onSubmit={form.handleSubmit(onSubmit, onError)}
        className="grid grid-cols-1 lg:grid-cols-3 gap-5"
      >
        {/* Bloque 1: identidad */}
        <Card padding="roomy" className="lg:col-span-2">
          <CardLabel>Identidad del club</CardLabel>
          <div className="space-y-4 mt-4">
            <Input
              label="Nombre"
              placeholder="Halcones FC"
              autoFocus
              {...form.register('nombre')}
              error={form.formState.errors.nombre?.message}
            />
            <div>
              <Input
                label="Slug (URL)"
                placeholder="halcones-fc"
                {...form.register('slug')}
                error={form.formState.errors.slug?.message}
              />
              <p className="text-xs text-ink-mute font-serif italic mt-1">
                Se autocompleta desde el nombre. Solo minúsculas, números y guiones.
              </p>
            </div>
            <Input
              label="URL del escudo (opcional)"
              placeholder="https://..."
              {...form.register('escudoUrl')}
              error={form.formState.errors.escudoUrl?.message}
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Color primario</label>
                <input
                  type="color"
                  className="h-10 w-full rounded-card border border-line cursor-pointer"
                  {...form.register('colorPrimario')}
                />
              </div>
              <div>
                <label className="label">Color secundario (opcional)</label>
                <input
                  type="color"
                  className="h-10 w-full rounded-card border border-line cursor-pointer"
                  {...form.register('colorSecundario')}
                />
              </div>
            </div>
            <Input
              label="Página web (opcional)"
              placeholder="https://halconesfc.cl"
              {...form.register('paginaWeb')}
              error={form.formState.errors.paginaWeb?.message}
            />
            <div>
              <label className="label">Reseña (opcional)</label>
              <textarea
                className="input min-h-[80px]"
                placeholder="Historia, valores, descripción del club…"
                {...form.register('resena')}
              />
            </div>
          </div>
        </Card>

        {/* Bloque 2: categorías */}
        <Card padding="roomy">
          <CardLabel>Categorías en las que compite</CardLabel>
          <p className="text-xs text-ink-mute font-serif italic mt-1 mb-3">
            El club tendrá un plantel independiente por cada categoría.
          </p>
          {loadingCats && (
            <p className="text-sm font-serif italic text-ink-mute">
              Cargando categorías…
            </p>
          )}
          {!loadingCats && (categorias?.length ?? 0) === 0 && (
            <div className="text-sm bg-accent/10 border border-accent/30 rounded-card p-3 text-ink">
              No hay categorías definidas todavía.{' '}
              <Link
                href="/admin/categorias"
                className="text-accent font-semibold hover:underline"
              >
                Crear primera categoría
              </Link>
              .
            </div>
          )}
          {!loadingCats && categorias && categorias.length > 0 && (
            <div className="space-y-2">
              {categorias
                .filter((c) => c.activa)
                .map((c) => (
                  <label
                    key={c.id}
                    className="flex items-start gap-2 p-2 rounded-card hover:bg-paper cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={categoriasSelected.includes(c.id)}
                      onChange={() => toggleCategoria(c.id)}
                      className="mt-0.5"
                    />
                    <div className="text-sm">
                      <div className="font-semibold text-ink">{c.nombre}</div>
                      <div className="text-xs text-ink-mute">
                        Edad mín. {c.edadMinimaGeneral}
                        {c.cupoExcepcionesPorEquipo > 0 &&
                        c.edadMinimaExcepcion != null
                          ? ` · +${c.cupoExcepcionesPorEquipo} excep. desde ${c.edadMinimaExcepcion}`
                          : ''}
                      </div>
                    </div>
                  </label>
                ))}
            </div>
          )}
          {form.formState.errors.categoriaIds && (
            <p className="text-xs text-danger mt-2">
              {form.formState.errors.categoriaIds.message}
            </p>
          )}
        </Card>

        {/* Bloque 3: directiva */}
        <Card padding="roomy" className="lg:col-span-3">
          <CardLabel>Directiva (opcional)</CardLabel>
          <p className="text-xs text-ink-mute font-serif italic mt-1 mb-4">
            Contactos de la directiva del club. No requieren cuenta en el sistema.
          </p>

          <div className="mb-4">
            <div className="text-[10px] uppercase tracking-[0.15em] font-semibold text-ink-mute mb-2">
              Presidente
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input
                placeholder="Nombre"
                {...form.register('presidenteNombre')}
              />
              <Input
                placeholder="Email"
                {...form.register('presidenteEmail')}
                error={form.formState.errors.presidenteEmail?.message}
              />
              <Input
                placeholder="Teléfono"
                {...form.register('presidenteTelefono')}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-[0.15em] font-semibold text-ink-mute">
                Delegados
              </div>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() =>
                  appendDelegado({ nombre: '', email: '', telefono: '' })
                }
              >
                <Plus size={12} /> Agregar delegado
              </Button>
            </div>
            {delegadosFields.length === 0 && (
              <p className="text-xs font-serif italic text-ink-mute">
                Sin delegados cargados.
              </p>
            )}
            <div className="space-y-2">
              {delegadosFields.map((field, idx) => (
                <div
                  key={field.id}
                  className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-start"
                >
                  <Input
                    placeholder="Nombre"
                    {...form.register(`delegados.${idx}.nombre` as const)}
                    error={
                      form.formState.errors.delegados?.[idx]?.nombre?.message
                    }
                  />
                  <Input
                    placeholder="Email"
                    {...form.register(`delegados.${idx}.email` as const)}
                    error={
                      form.formState.errors.delegados?.[idx]?.email?.message
                    }
                  />
                  <Input
                    placeholder="Teléfono"
                    {...form.register(`delegados.${idx}.telefono` as const)}
                  />
                  <button
                    type="button"
                    onClick={() => removeDelegado(idx)}
                    className="h-10 w-10 flex items-center justify-center rounded-card hover:bg-danger/10 text-danger"
                    aria-label="Quitar delegado"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <div className="lg:col-span-3 flex items-center gap-3">
          <Button
            type="submit"
            variant="accent"
            loading={createClub.isPending}
          >
            <Save size={14} /> Crear club
          </Button>
          <Link href="/admin/clubes">
            <Button variant="ghost" size="sm">
              Cancelar
            </Button>
          </Link>
        </div>
      </form>
    </>
  );
}
