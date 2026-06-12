'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { useIsSuperAdmin, useMe } from '@/hooks/use-admin';

/**
 * Guard de la sección de plataforma. Solo SUPER_ADMIN puede ver `/admin/super/*`.
 *
 * Antes, un admin de liga que aterrizaba en `/admin/super` (URL heredada de una
 * sesión previa, back del navegador o tipeo directo) veía el cascarón del panel
 * de super admin; el backend rechazaba los datos con 403 pero la UI igual se
 * renderizaba. Acá redirigimos al panel de la liga apenas sabemos que la sesión
 * no es super admin. Esperamos a que `/auth/me` resuelva para no rebotar al
 * propio super admin durante la carga.
 */
export default function SuperAdminSectionLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement | null {
  const router = useRouter();
  const { isLoading } = useMe();
  const isSuperAdmin = useIsSuperAdmin();

  useEffect(() => {
    if (!isLoading && !isSuperAdmin) {
      router.replace('/admin');
    }
  }, [isLoading, isSuperAdmin, router]);

  if (isLoading || !isSuperAdmin) return null;

  return <>{children}</>;
}
