import { NextResponse } from 'next/server';

/**
 * Middleware de Fase 0 — NO bloquea rutas.
 *
 * El access token JWT vive en localStorage (Zustand persist), no en cookie,
 * así que el middleware del servidor no tiene forma de leerlo. El guard de
 * auth se hace client-side en `app/dashboard/layout.tsx` (verifica el store
 * con `useAuthStore` y redirige a /login si no hay token). La validación
 * real del token la hace cada call al API, que devuelve 401 si expiró.
 *
 * Cuando movamos a auth basada en cookie HttpOnly (más seguro contra XSS y
 * habilita SSR autenticado), este middleware vuelve a validar la cookie.
 */
export function middleware(): NextResponse {
  return NextResponse.next();
}

// matcher vacío → el middleware no corre para ninguna ruta. Cuando volvamos
// a auth por cookie, agregamos los paths que queremos proteger.
export const config = {
  matcher: [],
};
