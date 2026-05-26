'use client';

import { use } from 'react';

import { RankingPage } from '@/components/ranking-page';

export default function GoleadoresPage({
  params,
}: {
  params: Promise<{ ligaSlug: string }>;
}): React.ReactElement {
  const { ligaSlug } = use(params);
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
