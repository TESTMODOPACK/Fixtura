'use client';

import { useEffect, useState } from 'react';

/**
 * T27 — los links de email llevan el token en el FRAGMENT (#token=…), que
 * nunca viaja al servidor. Acá se lee el hash primero y, como fallback para
 * links viejos aún en vuelo, la query (?token=…) — que además se limpia de
 * la barra de direcciones para que no quede en historial ni en el cache del
 * service worker.
 */
export function leerTokenDeUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const deHash = hash.get('token');
  if (deHash) return deHash;

  const query = new URLSearchParams(window.location.search);
  const deQuery = query.get('token');
  if (deQuery) {
    try {
      query.delete('token');
      const search = query.toString();
      window.history.replaceState(
        null,
        '',
        window.location.pathname + (search ? `?${search}` : '') + window.location.hash,
      );
    } catch {
      // Si replaceState falla (navegador raro), el token igual se usa.
    }
    return deQuery;
  }
  return null;
}

/**
 * `listo` distingue "todavía no leí la URL" (render inicial/SSR) de "leí y
 * no hay token" — sin eso, las páginas mostrarían un flash de error.
 */
export function useTokenDeUrl(): { token: string | null; listo: boolean } {
  const [estado, setEstado] = useState<{ token: string | null; listo: boolean }>({
    token: null,
    listo: false,
  });
  useEffect(() => {
    setEstado({ token: leerTokenDeUrl(), listo: true });
  }, []);
  return estado;
}
