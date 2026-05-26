'use client';

import { RankingPage } from '@/components/ranking-page';

export default function GoleadoresPage({
  params,
}: {
  params: { ligaSlug: string };
}): React.ReactElement {
  const { ligaSlug } = params;
  return (
    <RankingPage
      ligaSlug={ligaSlug}
      tipo="goleadores"
      titulo="GOLEADORES"
      subtitulo="Los pichichi del torneo, actualizado al cierre de cada acta."
      metricaLabel="goles"
    />
  );
}
