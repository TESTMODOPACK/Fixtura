import { TablaView } from '@/components/tabla-view';

/**
 * Sprint 36C — Tabla de posiciones filtrada por torneo específico.
 */
export default function TablaTorneoPage({
  params,
}: {
  params: { slug: string };
}): React.ReactElement {
  const { slug } = params;
  return <TablaView torneoSlug={slug} />;
}
