'use client';

import { RankingPage } from '@/components/ranking-page';

export default function AsistenciasPage(): React.ReactElement {
  return (
    <RankingPage
      tipo="asistencias"
      titulo="ASISTENCIAS"
      subtitulo="Los arquitectos del juego — pases que terminaron en gol."
      metricaLabel="asist."
    />
  );
}
