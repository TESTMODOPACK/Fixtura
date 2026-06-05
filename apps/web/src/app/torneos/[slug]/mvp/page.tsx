import { RankingPage } from '@/components/ranking-page';

/**
 * Sprint 36C — MVP filtrado por torneo específico.
 */
export default function MvpTorneoPage({
  params,
}: {
  params: { slug: string };
}): React.ReactElement {
  const { slug } = params;
  return (
    <RankingPage
      tipo="mvp"
      titulo="MVP DEL TORNEO"
      subtitulo="Most Valuable Player — votado al cierre de cada partido."
      metricaLabel="MVPs"
      torneoSlug={slug}
    />
  );
}
