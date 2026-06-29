import { toNestErrors, validateFieldsNatively } from '@hookform/resolvers';
import type { FieldValues, Resolver } from 'react-hook-form';
import type { ZodType } from 'zod';

/**
 * Resolver de react-hook-form compatible con Zod 4.
 *
 * El `zodResolver` de `@hookform/resolvers@3.x` está escrito para Zod 3: detecta
 * el error de validación con `Array.isArray(error.errors)`. En Zod 4 las issues
 * viven en `error.issues` y `error.errors` ya NO es un array, así que esa
 * comprobación da `false` y el resolver hace `throw error` en vez de devolver
 * los errores al formulario. Resultado: `handleSubmit` nunca llama al `onError`,
 * el banner/toast no se dispara y el ZodError queda como excepción no capturada
 * en consola (el clásico "el botón no muestra ningún error").
 *
 * Este wrapper usa `safeParseAsync` (no lanza) y lee `error.issues`, que es lo
 * que el resolver oficial hará a partir de su v5. Reusa los helpers internos
 * (`toNestErrors`, `validateFieldsNatively`) para mantener el mismo formato de
 * errores anidados que espera react-hook-form.
 */
export function zodResolver<TFieldValues extends FieldValues>(
  schema: ZodType,
): Resolver<TFieldValues> {
  return async (values, _context, options) => {
    const result = await schema.safeParseAsync(values);

    if (result.success) {
      if (options.shouldUseNativeValidation) {
        validateFieldsNatively({}, options);
      }
      return { values: result.data as TFieldValues, errors: {} };
    }

    const fieldErrors: Record<string, { type: string; message: string }> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join('.');
      // El primer mensaje por campo gana (igual que el resolver oficial).
      if (path && !fieldErrors[path]) {
        fieldErrors[path] = { type: String(issue.code), message: issue.message };
      }
    }

    return { values: {}, errors: toNestErrors(fieldErrors, options) };
  };
}
