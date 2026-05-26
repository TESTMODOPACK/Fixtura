'use client';

import { RankingPage } from '@/components/ranking-page';

export default function MvpPage({
  params,
}: {
  params: { ligaSlug: string };
}): React.ReactElement {
  const { ligaSlug } = params;
  return (
    <RankingPage
      ligaSlug={ligaSlug}
      tipo="mvp"
      titulo="MVP DEL TORNEO"
      subtitulo="Most Valuable Player — votado al cierre de cada partido."
      metricaLabel="MVPs"
    />
  );
}
