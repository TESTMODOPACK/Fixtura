import { FixtureView } from '@/components/fixture-view';

/**
 * Sprint 36C — Fixture filtrado por torneo específico.
 */
export default function FixtureTorneoPage({
  params,
}: {
  params: { slug: string };
}): React.ReactElement {
  const { slug } = params;
  return <FixtureView torneoSlug={slug} />;
}
