import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getDict, getLocale } from "@/lib/i18n";
import { getProjectAccess } from "@/lib/services/project-access";
import { BackLink } from "@/components/app/BackLink";
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
  const member = await isChannelMember(project.id, user.id);
  if (!member) {
    // Redirigimos a la ficha del proyecto: el viewer puede ver el proyecto
    // pero no entrar al chat. notFound() sería confuso (existe el proyecto).
    redirect(`/proyectos/${slug}`);
  }

  const channel = await ensureChannelForProject(project.id);
  const feed = await listChannelFeed(channel.id, user.id, { limit: 200 });

  const viewerIsPrivileged = await isPrivilegedInProject(project.id, user.id);

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
        <ChatFeed
          items={feed}
          viewerId={user.id}
          viewerIsPrivileged={viewerIsPrivileged}
          projectSlug={project.slug}
          feedDict={t.feed}
          pollDict={t.poll}
          locale={locale}
        />
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
