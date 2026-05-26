'use client';

import { use } from 'react';

import { RankingPage } from '@/components/ranking-page';

export default function MvpPage({
  params,
}: {
  params: Promise<{ ligaSlug: string }>;
}): React.ReactElement {
  const { ligaSlug } = use(params);
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
