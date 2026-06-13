import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

import { validarRut } from '@fixtura/types';

@ValidatorConstraint({ name: 'isRutChileno', async: false })
class IsRutChilenoConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    // null / undefined / '' lo dejamos pasar — el campo se valida como
    // opcional con @IsOptional() externo. Solo rechazamos strings con
    // contenido inválido.
    if (value === null || value === undefined) return true;
    if (typeof value !== 'string') return false;
    if (value.trim() === '') return true;
    return validarRut(value);
  }

  defaultMessage(_args: ValidationArguments): string {
    return 'RUT inválido (verifica el dígito verificador)';
  }
}

/**
 * Decorador `@IsRutChileno()` que valida RUT chileno con dígito
 * verificador módulo 11. Acepta cualquier formato razonable:
 *   "12.345.678-9", "12345678-9", "12345678-K".
 *
 * Combinar con `@IsOptional()` si el campo es opcional — vacío/null
 * no marca error.
 */
export function IsRutChileno(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsRutChilenoConstraint,
    });
  };
}
