import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { sequentialPrisma, safePrisma } from "@/lib/prisma/safe";
import { getDict, getLocale } from "@/lib/i18n";
import { formatDate } from "@/lib/utils/format";

const documentosProjectSelect = {
  name: true,
  slug: true,
} satisfies Prisma.ProjectSelect;

const documentosDocSelect = {
  id: true,
  title: true,
  storageKey: true,
  createdAt: true,
  project: { select: { name: true, slug: true } },
} satisfies Prisma.DocumentSelect;

type DocumentosProjectRow = Prisma.ProjectGetPayload<{ select: typeof documentosProjectSelect }>;
type DocumentosDocRow = Prisma.DocumentGetPayload<{ select: typeof documentosDocSelect }>;

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.documentos.metaTitle };
}

export default async function DocumentosPage({
  searchParams,
}: {
  searchParams: Promise<{ proyecto?: string }>;
}) {
  const user = await requireSession();
  const dict = await getDict();
  const locale = await getLocale();
  const t = dict.documentos;
  const { proyecto } = await searchParams;

  // safePrisma: si la lookup de participaciones falla, asumimos sin projectIds
  // y caemos al empty-state de "no tenés proyectos" en vez de crashear /documentos.
  const myParts = await safePrisma(
    () =>
      prisma.participation.findMany({
        where: { currentOwnerId: user.id },
        select: { projectId: true },
      }),
    [] as { projectId: string }[],
    "documentos:myParts"
  );
  const projectIds = Array.from(new Set(myParts.map((p) => p.projectId)));

  // Secuencial: 2 lecturas con connection_limit=1 ya pueden timeout cuando
  // coinciden con el render del layout (sidebar). Cada bucket cae a [].
  const [projects, documents] =
    projectIds.length > 0
      ? await sequentialPrisma([
          {
            run: () =>
              prisma.project.findMany({
                where: { id: { in: projectIds } },
                select: documentosProjectSelect,
                orderBy: { name: "asc" },
              }),
            fallback: [] as DocumentosProjectRow[],
            tag: "documentos:projects",
          },
          {
            run: () =>
              prisma.document.findMany({
                where: {
                  projectId: { in: projectIds },
                  ...(proyecto ? { project: { slug: proyecto } } : {}),
                },
                orderBy: { createdAt: "desc" },
                select: documentosDocSelect,
              }),
            fallback: [] as DocumentosDocRow[],
            tag: "documentos:documents",
          },
        ] as const)
      : [[] as DocumentosProjectRow[], [] as DocumentosDocRow[]];

  const chipClass = (active: boolean) =>
    `eyebrow whitespace-nowrap transition-colors ${
      active ? "!text-navy" : "!text-navy/40 hover:!text-navy"
    }`;

  return (
    <div>
      <header className="pt-5 pb-5 sm:pt-7 sm:pb-7">
        <p className="eyebrow">{t.eyebrow}</p>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy">{t.title}</h1>
        <p className="mt-3 text-navy/75 leading-relaxed">{t.intro}</p>
      </header>

      {projects.length > 1 && (
        <nav className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href={{ pathname: "/documentos" }} className={chipClass(!proyecto)}>
            {t.filterAll}
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
            {projectIds.length === 0 ? t.emptyNoProjects : t.emptyNoDocs}
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
                    {d.project.name} · {formatDate(d.createdAt, locale)}
                  </p>
                </div>
                <a
                  href={d.storageKey}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="eyebrow hover:!text-gold transition-colors shrink-0"
                >
                  {t.openLink}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
