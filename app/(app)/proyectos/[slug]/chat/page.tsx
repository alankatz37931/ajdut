import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getDict, getLocale } from "@/lib/i18n";
import type { Dict } from "@/lib/i18n";
import { getProjectAccess } from "@/lib/services/project-access";
import { BackLink } from "@/components/app/BackLink";
import { SkeletonLine } from "@/components/ui/Skeleton";
import {
  ensureChannelForProject,
  listChannelFeed,
  isChannelMember,
  isPrivilegedInProject,
} from "@/lib/services/chat";
import { ChatFeed } from "./ChatFeed";
import { MessageComposer } from "./MessageComposer";
import { PollComposer } from "./PollComposer";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const dict = await getDict();
  return { title: dict.chat.metaTitle };
}

export default async function ProjectChatPage({ params }: Params) {
  const user = await requireSession();
  const dict = await getDict();
  const locale = await getLocale();
  const t = dict.chat;
  const { slug } = await params;

  const project = await prisma.project.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      ownerId: true,
      status: true,
    },
  });
  if (!project) notFound();

  const access = await getProjectAccess({
    userId: user.id,
    userRole: user.role,
    projectId: project.id,
    ownerId: project.ownerId,
    projectStatus: project.status,
  });
  if (!access.canView) notFound();

  // Acceso al chat: miembro asignado (myShares > 0) o privilegiado
  // (owner/co-admin/admin). InfoRequest aprobada NO da acceso al chat
  // — el chat es del círculo cerrado del proyecto.
  // Este gate corre antes del render para que un no-miembro nunca vea ni el
  // composer ni el skeleton del feed — si quisiéramos suspender también este
  // check tendríamos que mostrar UI a alguien que no debería verla.
  const member = await isChannelMember(project.id, user.id);
  if (!member) {
    // Redirigimos a la ficha del proyecto: el viewer puede ver el proyecto
    // pero no entrar al chat. notFound() sería confuso (existe el proyecto).
    redirect(`/proyectos/${slug}`);
  }

  // El feed (ensureChannelForProject + listChannelFeed + isPrivilegedInProject)
  // se suspende en su propio async child: el composer no depende del feed,
  // así que el usuario puede empezar a tipear mientras los mensajes cargan.
  return (
    <div>
      <header className="pt-1 hairline-b pb-5">
        <BackLink fallback={`/proyectos/${slug}`}>{t.back}</BackLink>
        <h1 className="font-sans mt-3 sm:mt-4 text-h1 text-navy break-words">
          {project.name}
        </h1>
        <p className="mt-3 text-navy/60 text-sm leading-relaxed">
          {t.subtitle}
        </p>
      </header>

      {/* Feed: mensajes + encuestas mezclados cronológicamente. */}
      <section className="mt-6 sm:mt-8">
        <p className="font-mono text-sm tracking-wider mb-4">
          <span className="text-gold">01</span>{" "}
          <span className="text-navy">· {t.sectionConversation}</span>
        </p>
        <Suspense fallback={<ChatFeedSkeleton />}>
          <ChannelFeedAsync
            projectId={project.id}
            projectSlug={project.slug}
            viewerId={user.id}
            feedDict={t.feed}
            pollDict={t.poll}
            locale={locale}
          />
        </Suspense>
      </section>

      {/* Composer de mensaje */}
      <section className="hairline-t mt-8 pt-6">
        <p className="font-mono text-sm tracking-wider mb-4">
          <span className="text-gold">02</span>{" "}
          <span className="text-navy">· {t.sectionNewMessage}</span>
        </p>
        <MessageComposer projectSlug={project.slug} dict={t.composer} />
      </section>

      {/* Composer de encuesta (collapsible) */}
      <section className="hairline-t mt-8 pt-6">
        <p className="font-mono text-sm tracking-wider mb-4">
          <span className="text-gold">03</span>{" "}
          <span className="text-navy">· {t.sectionNewPoll}</span>
        </p>
        <PollComposer projectSlug={project.slug} dict={t.poll} />
      </section>
    </div>
  );
}

/**
 * Async server component aislado: hace los awaits caros del feed
 * (ensureChannelForProject + listChannelFeed + isPrivilegedInProject) sin
 * bloquear el paint del header + composer. Lo envuelve un <Suspense> en el
 * parent.
 */
async function ChannelFeedAsync({
  projectId,
  projectSlug,
  viewerId,
  feedDict,
  pollDict,
  locale,
}: {
  projectId: string;
  projectSlug: string;
  viewerId: string;
  feedDict: Dict["chat"]["feed"];
  pollDict: Dict["chat"]["poll"];
  locale: string;
}) {
  const channel = await ensureChannelForProject(projectId);
  const [feed, viewerIsPrivileged] = await Promise.all([
    listChannelFeed(channel.id, viewerId, { limit: 200 }),
    isPrivilegedInProject(projectId, viewerId),
  ]);

  return (
    <ChatFeed
      items={feed}
      viewerId={viewerId}
      viewerIsPrivileged={viewerIsPrivileged}
      projectSlug={projectSlug}
      feedDict={feedDict}
      pollDict={pollDict}
      locale={locale}
    />
  );
}

/**
 * Placeholder mientras carga el feed — 4 filas de mensaje hairline-separadas
 * para mantener la altura visual y evitar reflow cuando llegan los datos.
 */
function ChatFeedSkeleton() {
  return (
    <ul className="hairline-t" aria-hidden>
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="hairline-b py-4 space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <SkeletonLine width="w-32" height="h-4" />
            <SkeletonLine width="w-20" height="h-3" />
          </div>
          <SkeletonLine width="w-full" height="h-3" />
          <SkeletonLine width="w-4/5" height="h-3" />
        </li>
      ))}
    </ul>
  );
}
