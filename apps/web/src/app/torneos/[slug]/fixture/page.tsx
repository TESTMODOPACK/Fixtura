import { FixtureView } from '@/components/fixture-view';

/**
 * Sprint 36C — Fixture filtrado por torneo específico.
 */
export default async function FixtureTorneoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<React.ReactElement> {
  const { slug } = await params;
  return <FixtureView torneoSlug={slug} />;
}
