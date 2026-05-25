import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware mínimo de Fase 0.
 *
 * El access token JWT vive en localStorage (Zustand persist), no en cookie,
 * así que aquí solo redirigimos /dashboard → /login si NO hay marca de
 * sesión persistida. La validación real del token la hace cada llamada al
 * API (que devuelve 401 si está vencido).
 *
 * Para auth basada en cookie (necesaria en SSR estricto) se ampliará en
 * un sprint posterior.
 */
export function middleware(req: NextRequest): NextResponse {
  const isDashboard = req.nextUrl.pathname.startsWith('/dashboard');
  if (!isDashboard) return NextResponse.next();

  const persisted = req.cookies.get('fixtura-auth');
  if (!persisted) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
