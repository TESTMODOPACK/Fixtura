'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Plus, Save, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useFieldArray, useForm, type FieldErrors } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Card, CardLabel } from '@/components/ui/card';
import { ColorSwatchPicker } from '@/components/ui/color-swatch-picker';
import {
  FormErrorBanner,
  FormErrorChip,
  rhfErrorsToBanner,
} from '@/components/ui/form-errors';
import { Input } from '@/components/ui/input';
import { PageHead } from '@/components/ui/page-head';
import { useCategorias, useCreateClub } from '@/hooks/use-admin';
import { toastError, toastSuccess, toastWarning } from '@/lib/toast';

/**
 * Sprint 26C — Crear nuevo club.
 *
 * Form único (sin wizard) con tres bloques:
 *   1. Identidad: nombre, slug, escudo, colores, página web.
 *   2. Categorías: multi-check de categorías activas de la liga.
 *   3. Directiva opcional: presidente + delegados (contactos sin login).
 *
 * Los jugadores NO se cargan aquí — se hace en la ficha del club después
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
  z.email('Email inválido — usa formato nombre@dominio.com').max(150).optional(),
);

/**
 * URL opcional: vacío → undefined. Si hay texto, auto-prepende https://
 * cuando falta el protocolo. Esto evita el bug clásico de "tipeé
 * www.club.cl y el form no me deja seguir".
 */
const optionalUrl = z.preprocess(
  (v) => {
    if (typeof v !== 'string') return v;
    const trimmed = v.trim();
    if (trimmed === '') return undefined;
    // Auto-prepend https:// si no trae protocolo.
    if (!/^https?:\/\//i.test(trimmed)) {
      return `https://${trimmed}`;
    }
    return trimmed;
  },
  z.url('URL inválida — revisa el formato').max(500).optional(),
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
  escudoUrl: optionalUrl,
  colorPrimario: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Formato hex #RRGGBB'),
  colorSecundario: z
    .string()
    .optional()
    .refine(
      (v) => !v || /^#[0-9a-fA-F]{6}$/.test(v),
      'Formato hex #RRGGBB',
    ),
  paginaWeb: optionalUrl,
  resena: z.string().max(2000).optional(),
  categoriaIds: z.array(z.string().uuid()).min(1, 'Elige al menos una categoría'),
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
    try {
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
      toastSuccess(`Club "${club.nombre}" creado correctamente.`);
      router.push(`/admin/clubes/${club.id}`);
    } catch (err) {
      toastError(err);
      if (errorBannerRef.current) {
        errorBannerRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }
  };

  // Cuando handleSubmit detecta errores de validación, llama a onError
  // (en vez de onSubmit). Sin este handler, el botón "Crear club" parece
  // que no hace nada cuando hay un email mal formado u otro campo
  // inválido. Aquí scrolleamos al banner para que el usuario vea qué falta.
  const onError = (errors: FieldErrors<ClubForm>): void => {
    // eslint-disable-next-line no-console
    console.warn('[nuevo-club] validación falló:', errors);
    // Sprint 30 fix — toast como red de seguridad cuando el banner no
    // captura el error (FieldArray nested) o está fuera del viewport.
    const flat = rhfErrorsToBanner(
      errors as Record<string, unknown>,
      FIELD_LABEL,
    );
    if (flat.length > 0) {
      toastWarning(
        `Revisa: ${flat
          .slice(0, 3)
          .map((e) => e.label)
          .join(', ')}${flat.length > 3 ? '…' : ''}`,
      );
    } else {
      toastWarning('Hay errores en el formulario. Revisa los campos marcados.');
    }
    if (errorBannerRef.current) {
      errorBannerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const apiError = createClub.error;
  // Sprint 27 — usamos rhfErrorsToBanner para campos planos; el caso
  // de delegados (FieldArray) lo manejamos aparte.
  const formErrors = form.formState.errors as Record<
    string,
    { message?: string } | undefined
  >;
  const erroresParaMostrar = rhfErrorsToBanner(
    Object.fromEntries(
      Object.entries(formErrors).filter(([k]) => k !== 'delegados'),
    ),
    FIELD_LABEL,
  );
  const delegadosErrors = form.formState.errors.delegados as
    | Array<{
        nombre?: { message?: string };
        email?: { message?: string };
        telefono?: { message?: string };
      }>
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
        sub="Carga los datos del club. Después puedes sumar la plantilla por categoría desde su ficha."
      >
        <Link href="/admin/clubes">
          <Button variant="default" size="sm">
            <ArrowLeft size={14} /> Cancelar
          </Button>
        </Link>
      </PageHead>

      <FormErrorBanner
        ref={errorBannerRef}
        fieldErrors={erroresParaMostrar}
        apiError={apiError}
        apiTitle="No se pudo crear el club"
        validationTitle="Revisa los campos marcados antes de crear el club:"
      />


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
            <ColorSwatchPicker
              label="Color primario"
              value={form.watch('colorPrimario') ?? ''}
              onChange={(hex) =>
                form.setValue('colorPrimario', hex, {
                  shouldValidate: true,
                  shouldDirty: true,
                })
              }
              error={form.formState.errors.colorPrimario?.message}
              help="Color principal del escudo / camiseta titular del club."
            />
            <ColorSwatchPicker
              label="Color secundario (opcional)"
              value={form.watch('colorSecundario') ?? ''}
              onChange={(hex) =>
                form.setValue('colorSecundario', hex, {
                  shouldValidate: true,
                  shouldDirty: true,
                })
              }
              allowEmpty
              error={form.formState.errors.colorSecundario?.message}
              help="Color complementario (alterno, vivos). Deja vacío si no aplica."
            />
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

        <div className="lg:col-span-3 flex items-center gap-3 flex-wrap">
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
          {form.formState.isSubmitted && (
            <FormErrorChip
              fieldErrors={erroresParaMostrar}
              hasApiError={apiError != null}
            />
          )}
        </div>
      </form>
    </>
  );
}
