'use client';

import { RankingPage } from '@/components/ranking-page';

export default function MvpPage(): React.ReactElement {
  return (
    <RankingPage
      tipo="mvp"
      titulo="MVP DEL TORNEO"
      subtitulo="Most Valuable Player — votado al cierre de cada partido."
      metricaLabel="MVPs"
    />
  );
}
