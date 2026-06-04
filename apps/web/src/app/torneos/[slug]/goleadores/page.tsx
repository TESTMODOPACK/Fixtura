import { RankingPage } from '@/components/ranking-page';

/**
 * Sprint 36C — Goleadores filtrados por torneo específico.
 */
export default async function GoleadoresTorneoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<React.ReactElement> {
  const { slug } = await params;
  return (
    <RankingPage
      tipo="goleadores"
      titulo="GOLEADORES"
      subtitulo="Los pichichi del torneo, actualizado al cierre de cada acta."
      metricaLabel="goles"
      torneoSlug={slug}
    />
  );
}
