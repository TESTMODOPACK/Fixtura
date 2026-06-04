import { RankingPage } from '@/components/ranking-page';

/**
 * Sprint 36C — Asistencias filtradas por torneo específico.
 */
export default async function AsistenciasTorneoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<React.ReactElement> {
  const { slug } = await params;
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
