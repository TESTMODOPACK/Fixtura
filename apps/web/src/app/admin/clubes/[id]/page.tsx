'use client';

import { AlertTriangle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHead } from '@/components/ui/page-head';
import { useClub } from '@/hooks/use-admin';

/**
 * Sprint 32 — la vieja vista por club se reemplaza por una vista por
 * (club, categoría). Esta página solo redirige al primer detalle del
 * club (si tiene categorías) o muestra un mensaje claro si no.
 *
 * Antes vivía acá toda la lógica de la ficha — ahora la lógica está
 * en /admin/clubes/[id]/[catId]/page.tsx.
 */
export default function ClubRedirectPage({
  params,
}: {
  params: { id: string };
}): React.ReactElement {
  const { id } = params;
  const router = useRouter();
  const { data: club, isLoading } = useClub(id);

  useEffect(() => {
    if (!club) return;
    const primera = club.categoriasDetalle[0];
    if (primera) {
      router.replace(`/admin/clubes/${id}/${primera.categoriaId}`);
    }
  }, [club, id, router]);

  if (isLoading) {
    return (
      <p className="font-serif italic text-ink-mute py-8">Cargando club…</p>
    );
  }

  if (!club) {
    return (
      <Card padding="roomy" className="text-center">
        <AlertTriangle size={28} className="mx-auto text-accent mb-2" />
        <p className="font-serif italic text-ink-mute">
          Club no encontrado.{' '}
          <Link href="/admin/clubes" className="text-accent">
            Volver a la lista
          </Link>
          .
        </p>
      </Card>
    );
  }

  // Sin categorías → mostrar mensaje + link a editar club.
  if (club.categoriasDetalle.length === 0) {
    return (
      <>
        <PageHead
          eyebrow={`Club · ${club.slug}`}
          title={club.nombre}
          sub="Este club no tiene categorías asignadas todavía."
        >
          <Link href="/admin/clubes">
            <Button variant="default" size="sm">
              <ArrowLeft size={14} /> Volver
            </Button>
          </Link>
        </PageHead>
        <Card padding="roomy" className="text-center">
          <AlertTriangle size={28} className="mx-auto text-accent mb-3" />
          <p className="font-serif italic text-ink-mute">
            Asigná al menos una categoría al club para empezar a cargar
            jugadores y editar su directiva específica.
          </p>
        </Card>
      </>
    );
  }

  // Mientras router.replace está corriendo, mostrar loader.
  return (
    <p className="font-serif italic text-ink-mute py-8">Redirigiendo…</p>
  );
}
