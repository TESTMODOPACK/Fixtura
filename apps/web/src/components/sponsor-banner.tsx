'use client';

import { useQuery } from '@tanstack/react-query';

import type { PosicionSponsor, SponsorPublico } from '@fixtura/types';

import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/cn';

/**
 * Componente reutilizable que muestra los sponsors activos y vigentes
 * de una posición específica del portal público. Si no hay sponsors
 * para esa posición, no renderiza nada.
 *
 * Usa el endpoint público `/public/sponsors?posicion=X` — sin auth.
 */
export function SponsorBanner({
  posicion,
  className,
  maxItems,
}: {
  posicion: PosicionSponsor;
  className?: string;
  /** Si se define, limita la cantidad de banners visibles. */
  maxItems?: number;
}): React.ReactElement | null {
  const { data } = useQuery({
    queryKey: ['public', 'sponsors', posicion],
    queryFn: () =>
      apiFetch<SponsorPublico[]>(`/public/sponsors?posicion=${posicion}`),
    // Cache largo: los sponsors no cambian con la frecuencia del fixture
    staleTime: 5 * 60 * 1000,
  });

  if (!data || data.length === 0) return null;
  const sponsors = maxItems ? data.slice(0, maxItems) : data;

  return (
    <div className={cn('flex flex-wrap items-center justify-center gap-4', className)}>
      {sponsors.map((s) => (
        <SponsorItem key={s.id} sponsor={s} />
      ))}
    </div>
  );
}

function SponsorItem({ sponsor }: { sponsor: SponsorPublico }): React.ReactElement {
  const contenido = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={sponsor.imagenUrl}
      alt={sponsor.nombre}
      className="max-h-16 object-contain transition-transform hover:scale-105"
      loading="lazy"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = 'none';
      }}
    />
  );

  if (sponsor.linkUrl) {
    return (
      <a
        href={sponsor.linkUrl}
        target="_blank"
        rel="noopener noreferrer sponsored"
        title={sponsor.nombre}
        className="block"
      >
        {contenido}
      </a>
    );
  }

  return (
    <div title={sponsor.nombre} className="block">
      {contenido}
    </div>
  );
}
