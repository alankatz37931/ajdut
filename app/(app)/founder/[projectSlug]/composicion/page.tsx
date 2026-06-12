import { redirect } from "next/navigation";
import type { Route } from "next";

type Params = { params: Promise<{ projectSlug: string }> };

/**
 * La Composición de participaciones se fusionó dentro de la página de Equipo
 * del proyecto. Esta ruta queda como redirect permanente para no romper links
 * ni bookmarks existentes.
 */
export default async function FounderCompositionRedirect({ params }: Params) {
  const { projectSlug } = await params;
  redirect(`/founder/${projectSlug}/equipo` as Route);
}
