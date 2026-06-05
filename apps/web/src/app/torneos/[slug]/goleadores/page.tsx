import { RankingPage } from '@/components/ranking-page';

/**
 * Sprint 36C — Goleadores filtrados por torneo específico.
 */
export default function GoleadoresTorneoPage({
  params,
}: {
  params: { slug: string };
}): React.ReactElement {
  const { slug } = params;
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
