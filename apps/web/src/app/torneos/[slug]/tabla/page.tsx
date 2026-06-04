import { TablaView } from '@/components/tabla-view';

/**
 * Sprint 36C — Tabla de posiciones filtrada por torneo específico.
 */
export default async function TablaTorneoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<React.ReactElement> {
  const { slug } = await params;
  return <TablaView torneoSlug={slug} />;
}
