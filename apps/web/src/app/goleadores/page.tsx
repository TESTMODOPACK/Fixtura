'use client';

import { RankingPage } from '@/components/ranking-page';

export default function GoleadoresPage(): React.ReactElement {
  return (
    <RankingPage
      tipo="goleadores"
      titulo="GOLEADORES"
      subtitulo="Los pichichi del torneo, actualizado al cierre de cada acta."
      metricaLabel="goles"
    />
  );
}
