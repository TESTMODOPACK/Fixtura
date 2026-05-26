'use client';

import { RankingPage } from '@/components/ranking-page';

export default function AsistenciasPage({
  params,
}: {
  params: { ligaSlug: string };
}): React.ReactElement {
  const { ligaSlug } = params;
  return (
    <RankingPage
      ligaSlug={ligaSlug}
      tipo="asistencias"
      titulo="ASISTENCIAS"
      subtitulo="Los arquitectos del juego — pases que terminaron en gol."
      metricaLabel="asist."
    />
  );
}
