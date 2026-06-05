import { RankingPage } from '@/components/ranking-page';

/**
 * Sprint 36C — Asistencias filtradas por torneo específico.
 */
export default function AsistenciasTorneoPage({
  params,
}: {
  params: { slug: string };
}): React.ReactElement {
  const { slug } = params;
  return (
    <RankingPage
      tipo="asistencias"
      titulo="ASISTENCIAS"
      subtitulo="Los arquitectos del juego — pases que terminaron en gol."
      metricaLabel="asist."
      torneoSlug={slug}
    />
  );
}
