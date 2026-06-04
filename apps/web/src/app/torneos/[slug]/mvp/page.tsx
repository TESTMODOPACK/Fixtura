import { RankingPage } from '@/components/ranking-page';

/**
 * Sprint 36C — MVP filtrado por torneo específico.
 */
export default async function MvpTorneoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<React.ReactElement> {
  const { slug } = await params;
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
