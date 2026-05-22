import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { formatDate } from "@/lib/utils/format";

export const metadata = { title: "Documentos · AJDUT" };

export default async function DocumentosPage({
  searchParams,
}: {
  searchParams: Promise<{ proyecto?: string }>;
}) {
  const user = await requireSession();
  const { proyecto } = await searchParams;

  // Proyectos donde el usuario tiene acciones.
  const myParts = await prisma.participation.findMany({
    where: { currentOwnerId: user.id },
    select: { projectId: true },
  });
  const projectIds = Array.from(new Set(myParts.map((p) => p.projectId)));

  const [projects, documents] =
    projectIds.length > 0
      ? await Promise.all([
          prisma.project.findMany({
            where: { id: { in: projectIds } },
            select: { name: true, slug: true },
            orderBy: { name: "asc" },
          }),
          prisma.document.findMany({
            where: {
              projectId: { in: projectIds },
              ...(proyecto ? { project: { slug: proyecto } } : {}),
            },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              title: true,
              storageKey: true,
              createdAt: true,
              project: { select: { name: true, slug: true } },
            },
          }),
        ])
      : [[], []];

  const chipClass = (active: boolean) =>
    `eyebrow whitespace-nowrap transition-colors ${
      active ? "!text-navy" : "!text-navy/40 hover:!text-navy"
    }`;

  return (
    <div>
      <header className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        <p className="eyebrow">— Tus proyectos</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">Documentos</h1>
        <p className="mt-3 text-navy/75 leading-relaxed max-w-2xl">
          Todos los documentos que los founders compartieron en los proyectos
          donde tenés acciones, en un solo lugar.
        </p>
      </header>

      {projects.length > 1 && (
        <nav className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href={{ pathname: "/documentos" }} className={chipClass(!proyecto)}>
            Todos
          </Link>
          {projects.map((p) => (
            <Link
              key={p.slug}
              href={{ pathname: "/documentos", query: { proyecto: p.slug } }}
              className={chipClass(proyecto === p.slug)}
            >
              {p.name}
            </Link>
          ))}
        </nav>
      )}

      <div className="mt-8">
        {documents.length === 0 ? (
          <p className="text-navy/60">
            {projectIds.length === 0
              ? "Todavía no tenés acciones en ningún proyecto."
              : "No hay documentos compartidos por ahora."}
          </p>
        ) : (
          <ul className="hairline-t">
            {documents.map((d) => (
              <li
                key={d.id}
                className="hairline-b py-4 flex items-baseline justify-between gap-4"
              >
                <div className="min-w-0">
                  <p className="text-navy break-words">{d.title}</p>
                  <p className="mt-1 eyebrow !text-navy/50">
                    {d.project.name} · {formatDate(d.createdAt)}
                  </p>
                </div>
                <a
                  href={d.storageKey}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="eyebrow hover:!text-gold transition-colors shrink-0"
                >
                  Abrir ↗
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
