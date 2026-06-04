import { TenantHome } from '@/components/tenant-home';

/**
 * Sprint 36C — Vista de un torneo específico de la liga. Reutiliza el
 * componente TenantHome pasando torneoSlug por prop, así toda la lógica
 * de "resumen + cards + sponsors + footer" queda en un solo lugar.
 */
export default async function TorneoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<React.ReactElement> {
  const { slug } = await params;
  return <TenantHome torneoSlug={slug} />;
}
