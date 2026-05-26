/**
 * Servicio del chat por proyecto (Ola 7a).
 *
 * Filosofía:
 *  - Sin tiempo real: la UI hace `revalidatePath` después de cada acción.
 *  - Sin adjuntar archivos físicos: el mensaje puede traer `attachmentUrl`
 *    (link externo a Drive/Dropbox/Notion/etc.).
 *  - Moderación: el founder / co-admin / admin puede ocultar mensajes
 *    (soft delete). El historial queda — solo se filtra en la vista.
 *  - Votaciones: encuesta simple, 1 socio = 1 voto. `multiple=false` borra
 *    el voto previo del mismo usuario en otras opciones del poll.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { sequentialPrisma } from "@/lib/prisma/safe";
import { recordAudit } from "./audit";
import { ForbiddenError, NotFoundError, ValidationError } from "./errors";

// ─── Reusable Prisma include shapes (so fallbacks tipan limpio) ─────

const feedMessageInclude = {
  author: { select: { id: true, fullName: true, alias: true } },
  deletedBy: { select: { id: true, fullName: true } },
} satisfies Prisma.MessageInclude;

type FeedMessageRow = Prisma.MessageGetPayload<{
  include: typeof feedMessageInclude;
}>;

const feedPollInclude = {
  createdBy: { select: { id: true, fullName: true, alias: true } },
  options: {
    orderBy: { order: "asc" },
    include: {
      _count: { select: { votes: true } },
      votes: { select: { voterId: true } },
    },
  },
} satisfies Prisma.PollInclude;

type FeedPollRow = Prisma.PollGetPayload<{ include: typeof feedPollInclude }>;

const MAX_BODY = 4000;
const MAX_URL = 1000;
const MAX_OPTIONS = 20;
const MAX_OPTION_LABEL = 200;
const MAX_QUESTION = 500;

// ─── Helpers ───────────────────────────────────────────────────────

async function getChannelOrThrow(channelId: string) {
  const channel = await prisma.chatChannel.findUnique({
    where: { id: channelId },
    select: {
      id: true,
      projectId: true,
      isLocked: true,
      project: { select: { id: true, ownerId: true } },
    },
  });
  if (!channel) throw new NotFoundError("ChatChannel", channelId);
  return channel;
}

async function getUserOrThrow(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isActive: true, deletedAt: true },
  });
  if (!user || !user.isActive || user.deletedAt) {
    throw new ForbiddenError("Sesión inválida.");
  }
  return user;
}

/**
 * ¿El usuario es owner / co-admin del proyecto o admin de plataforma?
 * Estos roles pueden moderar (borrar mensajes) y cerrar polls de cualquiera.
 */
export async function isPrivilegedInProject(
  projectId: string,
  userId: string
): Promise<boolean> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });
  if (!project) return false;
  if (project.ownerId === userId) return true;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  if (user.role === "CO_ADMIN") {
    const link = await prisma.projectCoAdmin.findUnique({
      where: { projectId_userId: { projectId, userId } },
    });
    return !!link;
  }
  return false;
}

/**
 * ¿El usuario es "miembro" del canal (tiene acceso a leer/postear)?
 * Definición: tiene shares en el proyecto, o es owner/co-admin/admin.
 */
export async function isChannelMember(
  projectId: string,
  userId: string
): Promise<boolean> {
  if (await isPrivilegedInProject(projectId, userId)) return true;
  // Soft-delete: si el user fue eliminado, no debe contar como miembro del
  // canal aunque siga teniendo participations vinculadas (la baja no resetea
  // currentOwnerId — eso es operación humana).
  const myShares = await prisma.participation.count({
    where: {
      projectId,
      currentOwnerId: userId,
      currentOwner: { deletedAt: null },
    },
  });
  return myShares > 0;
}

// ─── Channel ───────────────────────────────────────────────────────

/**
 * Devuelve el ChatChannel del proyecto; lo crea si no existe (lazy).
 */
export async function ensureChannelForProject(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, chatChannel: { select: { id: true } } },
  });
  if (!project) throw new NotFoundError("Project", projectId);
  if (project.chatChannel) {
    return prisma.chatChannel.findUniqueOrThrow({
      where: { id: project.chatChannel.id },
    });
  }
  return prisma.chatChannel.create({ data: { projectId } });
}

// ─── Feed (mensajes + polls intercalados) ──────────────────────────

export type FeedAuthor = {
  id: string;
  fullName: string;
  alias: string | null;
};

export type FeedMessage = {
  kind: "message";
  id: string;
  createdAt: Date;
  author: FeedAuthor;
  body: string;
  attachmentUrl: string | null;
  deletedAt: Date | null;
  deletedBy: { id: string; fullName: string } | null;
};

export type FeedPollOption = {
  id: string;
  label: string;
  order: number;
  voteCount: number;
};

export type FeedPoll = {
  kind: "poll";
  id: string;
  createdAt: Date;
  createdBy: FeedAuthor;
  question: string;
  multiple: boolean;
  closesAt: Date | null;
  closedAt: Date | null;
  options: FeedPollOption[];
  totalVotes: number;
  myVoteOptionIds: string[];
};

export type FeedItem = FeedMessage | FeedPoll;

/**
 * Devuelve la mezcla de mensajes + polls del canal, ordenada por createdAt asc.
 * Los mensajes "borrados" se filtran a menos que el viewer sea privilegiado
 * (owner/co-admin/admin) — para que la moderación sea transparente para el
 * equipo pero invisible al resto.
 */
export async function listChannelFeed(
  channelId: string,
  viewerId: string,
  opts: { limit?: number } = {}
): Promise<FeedItem[]> {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const channel = await getChannelOrThrow(channelId);
  const viewerIsPrivileged = await isPrivilegedInProject(
    channel.projectId,
    viewerId
  );

  const [messages, polls] = await sequentialPrisma([
    {
      run: () =>
        prisma.message.findMany({
          where: {
            channelId,
            ...(viewerIsPrivileged ? {} : { deletedAt: null }),
          },
          orderBy: { createdAt: "asc" },
          take: limit,
          include: feedMessageInclude,
        }),
      fallback: [] as FeedMessageRow[],
      tag: "chat:feed:messages",
    },
    {
      run: () =>
        prisma.poll.findMany({
          where: { channelId },
          orderBy: { createdAt: "asc" },
          take: limit,
          include: {
            createdBy: { select: { id: true, fullName: true, alias: true } },
            options: {
              orderBy: { order: "asc" },
              include: {
                _count: { select: { votes: true } },
                // Filtramos por viewer acá (no se puede meter en el shape
                // reusable porque viewerId cambia por llamada). El tipo
                // resultante es asignable a FeedPollRow.
                votes: {
                  where: { voterId: viewerId },
                  select: { voterId: true },
                },
              },
            },
          },
        }),
      fallback: [] as FeedPollRow[],
      tag: "chat:feed:polls",
    },
  ] as const);

  const messageItems: FeedMessage[] = messages.map((m) => ({
    kind: "message",
    id: m.id,
    createdAt: m.createdAt,
    author: m.author,
    body: m.body,
    attachmentUrl: m.attachmentUrl,
    deletedAt: m.deletedAt,
    deletedBy: m.deletedBy
      ? { id: m.deletedBy.id, fullName: m.deletedBy.fullName }
      : null,
  }));

  const pollItems: FeedPoll[] = polls.map((p) => {
    const options: FeedPollOption[] = p.options.map((o) => ({
      id: o.id,
      label: o.label,
      order: o.order,
      voteCount: o._count.votes,
    }));
    const totalVotes = options.reduce((s, o) => s + o.voteCount, 0);
    const myVoteOptionIds = p.options
      .filter((o) => o.votes.length > 0)
      .map((o) => o.id);
    return {
      kind: "poll",
      id: p.id,
      createdAt: p.createdAt,
      createdBy: p.createdBy,
      question: p.question,
      multiple: p.multiple,
      closesAt: p.closesAt,
      closedAt: p.closedAt,
      options,
      totalVotes,
      myVoteOptionIds,
    };
  });

  return [...messageItems, ...pollItems].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
  );
}

// ─── Mensajes ──────────────────────────────────────────────────────

export type PostMessageInput = {
  channelId: string;
  authorId: string;
  body: string;
  attachmentUrl?: string | null;
};

export async function postMessage(input: PostMessageInput) {
  const channel = await getChannelOrThrow(input.channelId);
  if (channel.isLocked) {
    throw new ForbiddenError("El chat de este proyecto está bloqueado.");
  }
  await getUserOrThrow(input.authorId);

  const isMember = await isChannelMember(channel.projectId, input.authorId);
  if (!isMember) {
    throw new ForbiddenError("No tenés acceso al chat de este proyecto.");
  }

  const body = (input.body ?? "").trim();
  const url = (input.attachmentUrl ?? "").trim();

  if (!body && !url) {
    throw new ValidationError(
      "body",
      "El mensaje no puede estar vacío. Escribí algo o adjuntá un link."
    );
  }
  if (body.length > MAX_BODY) {
    throw new ValidationError(
      "body",
      `El mensaje no puede superar los ${MAX_BODY} caracteres.`
    );
  }
  if (url) {
    if (url.length > MAX_URL) {
      throw new ValidationError("attachmentUrl", "El link es demasiado largo.");
    }
    if (!/^https?:\/\//i.test(url)) {
      throw new ValidationError(
        "attachmentUrl",
        "El link debe empezar con http:// o https://"
      );
    }
  }

  const created = await prisma.message.create({
    data: {
      channelId: channel.id,
      authorId: input.authorId,
      body,
      attachmentUrl: url || null,
    },
  });

  await recordAudit(prisma, {
    actorId: input.authorId,
    projectId: channel.projectId,
    action: "CHAT.MESSAGE_POSTED",
    entityType: "Message",
    entityId: created.id,
    payload: { hasAttachment: !!url },
  });

  return created;
}

export type SoftDeleteMessageInput = {
  messageId: string;
  actorId: string;
};

export async function softDeleteMessage(input: SoftDeleteMessageInput) {
  const msg = await prisma.message.findUnique({
    where: { id: input.messageId },
    select: {
      id: true,
      channelId: true,
      authorId: true,
      deletedAt: true,
      channel: { select: { projectId: true } },
    },
  });
  if (!msg) throw new NotFoundError("Message", input.messageId);
  if (msg.deletedAt) {
    return prisma.message.findUniqueOrThrow({ where: { id: msg.id } });
  }

  await getUserOrThrow(input.actorId);
  const allowed = await isPrivilegedInProject(
    msg.channel.projectId,
    input.actorId
  );
  if (!allowed) {
    throw new ForbiddenError(
      "Solo el project owner, co-admin o admin pueden borrar mensajes."
    );
  }

  const updated = await prisma.message.update({
    where: { id: msg.id },
    data: { deletedAt: new Date(), deletedById: input.actorId },
  });

  await recordAudit(prisma, {
    actorId: input.actorId,
    projectId: msg.channel.projectId,
    action: "CHAT.MESSAGE_DELETED",
    entityType: "Message",
    entityId: msg.id,
    payload: { authorId: msg.authorId },
  });

  return updated;
}

// ─── Polls ─────────────────────────────────────────────────────────

export type CreatePollInput = {
  channelId: string;
  createdById: string;
  question: string;
  options: string[];
  multiple: boolean;
  closesAt?: Date | null;
};

export async function createPoll(input: CreatePollInput) {
  const channel = await getChannelOrThrow(input.channelId);
  if (channel.isLocked) {
    throw new ForbiddenError("El chat de este proyecto está bloqueado.");
  }
  await getUserOrThrow(input.createdById);

  const isMember = await isChannelMember(channel.projectId, input.createdById);
  if (!isMember) {
    throw new ForbiddenError("No tenés acceso al chat de este proyecto.");
  }

  const question = (input.question ?? "").trim();
  if (!question) {
    throw new ValidationError("question", "La pregunta no puede estar vacía.");
  }
  if (question.length > MAX_QUESTION) {
    throw new ValidationError(
      "question",
      `La pregunta no puede superar los ${MAX_QUESTION} caracteres.`
    );
  }

  const cleanedOptions = (input.options ?? [])
    .map((o) => (o ?? "").trim())
    .filter((o) => o.length > 0);
  if (cleanedOptions.length < 2) {
    throw new ValidationError(
      "options",
      "La encuesta necesita al menos 2 opciones."
    );
  }
  if (cleanedOptions.length > MAX_OPTIONS) {
    throw new ValidationError(
      "options",
      `Máximo ${MAX_OPTIONS} opciones por encuesta.`
    );
  }
  for (const o of cleanedOptions) {
    if (o.length > MAX_OPTION_LABEL) {
      throw new ValidationError(
        "options",
        `Cada opción no puede superar los ${MAX_OPTION_LABEL} caracteres.`
      );
    }
  }
  // Dedup case-insensitive: no tiene sentido tener dos opciones idénticas.
  const seen = new Set<string>();
  for (const o of cleanedOptions) {
    const k = o.toLowerCase();
    if (seen.has(k)) {
      throw new ValidationError(
        "options",
        "No puede haber opciones duplicadas."
      );
    }
    seen.add(k);
  }

  if (input.closesAt) {
    if (!(input.closesAt instanceof Date) || Number.isNaN(input.closesAt.getTime())) {
      throw new ValidationError("closesAt", "Fecha de cierre inválida.");
    }
    if (input.closesAt.getTime() <= Date.now()) {
      throw new ValidationError(
        "closesAt",
        "La fecha de cierre debe ser futura."
      );
    }
  }

  const created = await prisma.poll.create({
    data: {
      channelId: channel.id,
      createdById: input.createdById,
      question,
      multiple: input.multiple,
      closesAt: input.closesAt ?? null,
      options: {
        create: cleanedOptions.map((label, idx) => ({ label, order: idx })),
      },
    },
    include: { options: true },
  });

  await recordAudit(prisma, {
    actorId: input.createdById,
    projectId: channel.projectId,
    action: "CHAT.POLL_CREATED",
    entityType: "Poll",
    entityId: created.id,
    payload: {
      question,
      optionsCount: cleanedOptions.length,
      multiple: input.multiple,
    },
  });

  return created;
}

export type VotePollInput = {
  pollId: string;
  optionId: string;
  voterId: string;
};

export async function votePoll(input: VotePollInput) {
  const poll = await prisma.poll.findUnique({
    where: { id: input.pollId },
    include: {
      channel: { select: { id: true, projectId: true, isLocked: true } },
      options: { select: { id: true } },
    },
  });
  if (!poll) throw new NotFoundError("Poll", input.pollId);
  if (poll.channel.isLocked) {
    throw new ForbiddenError("El chat de este proyecto está bloqueado.");
  }

  await getUserOrThrow(input.voterId);
  const isMember = await isChannelMember(
    poll.channel.projectId,
    input.voterId
  );
  if (!isMember) {
    throw new ForbiddenError("No tenés acceso al chat de este proyecto.");
  }

  // ¿la opción pertenece a este poll?
  const target = poll.options.find((o) => o.id === input.optionId);
  if (!target) {
    throw new ValidationError("optionId", "Opción inválida para esta encuesta.");
  }

  // ¿poll abierto?
  if (poll.closedAt) {
    throw new ValidationError("pollId", "La encuesta ya está cerrada.");
  }
  if (poll.closesAt && poll.closesAt.getTime() <= Date.now()) {
    throw new ValidationError("pollId", "La encuesta ya venció.");
  }

  // Si multiple=false, borrar votos previos del voter en OTRAS opciones de
  // este poll (cambio de voto). Si vuelve a votar la misma opción es no-op.
  await prisma.$transaction(async (tx) => {
    if (!poll.multiple) {
      await tx.pollVote.deleteMany({
        where: {
          voterId: input.voterId,
          option: { pollId: poll.id },
          NOT: { optionId: input.optionId },
        },
      });
    }
    // upsert para idempotencia: si ya votó esta opción no rompemos.
    await tx.pollVote.upsert({
      where: {
        optionId_voterId: {
          optionId: input.optionId,
          voterId: input.voterId,
        },
      },
      update: {},
      create: {
        optionId: input.optionId,
        voterId: input.voterId,
      },
    });
  });

  await recordAudit(prisma, {
    actorId: input.voterId,
    projectId: poll.channel.projectId,
    action: "CHAT.POLL_VOTED",
    entityType: "Poll",
    entityId: poll.id,
    payload: { optionId: input.optionId },
  });

  return { ok: true as const };
}

export type ClosePollInput = {
  pollId: string;
  actorId: string;
};

export async function closePoll(input: ClosePollInput) {
  const poll = await prisma.poll.findUnique({
    where: { id: input.pollId },
    include: { channel: { select: { projectId: true } } },
  });
  if (!poll) throw new NotFoundError("Poll", input.pollId);
  if (poll.closedAt) {
    return poll;
  }

  await getUserOrThrow(input.actorId);
  const isCreator = poll.createdById === input.actorId;
  const isPrivileged = await isPrivilegedInProject(
    poll.channel.projectId,
    input.actorId
  );
  if (!isCreator && !isPrivileged) {
    throw new ForbiddenError(
      "Solo el creador del poll o el equipo del proyecto pueden cerrarlo."
    );
  }

  const updated = await prisma.poll.update({
    where: { id: poll.id },
    data: { closedAt: new Date() },
  });

  await recordAudit(prisma, {
    actorId: input.actorId,
    projectId: poll.channel.projectId,
    action: "CHAT.POLL_CLOSED",
    entityType: "Poll",
    entityId: poll.id,
    payload: { byCreator: isCreator },
  });

  return updated;
}

/**
 * Devuelve los emails de todos los "miembros" del canal (owner + co-admins +
 * holders de shares), excluyendo opcionalmente a uno (típicamente el autor
 * del mensaje).
 *
 * Antes: 1 sola findUnique con include profundo (project → owner + coAdmins +
 * participations → currentOwner). Con muchas participations, devolvía N filas
 * con el User completo cada una (cartesian-ish blow-up).
 *
 * Ahora: 3 lecturas chicas vía sequentialPrisma:
 *   1) project.owner
 *   2) projectCoAdmin.user del proyecto
 *   3) participation.currentOwner DISTINCT del proyecto
 * Se unen en JS y se deduplican por user.id. Si alguna query falla, esa
 * fuente queda vacía pero el envío de email sigue con el resto.
 */
type MemberUser = {
  id: string;
  email: string;
  isActive: boolean;
  deletedAt: Date | null;
};

export async function getChannelMemberEmails(
  projectId: string,
  excludeUserId?: string
): Promise<string[]> {
  const [owner, coAdmins, participationRows] = await sequentialPrisma([
    {
      run: () =>
        // Filtramos el proyecto por deletedAt: null — un proyecto eliminado
        // no debe disparar broadcasts. Si está deleted, devolvemos null y
        // el cálculo de miembros queda vacío para esa fuente.
        prisma.project
          .findUnique({
            where: { id: projectId },
            select: {
              deletedAt: true,
              owner: {
                select: { id: true, email: true, isActive: true, deletedAt: true },
              },
            },
          })
          .then((p) => (p && !p.deletedAt ? p.owner : null)),
      fallback: null as MemberUser | null,
      tag: "chat:getMembers:owner",
    },
    {
      run: () =>
        // Co-admin user soft-delete: filtramos en la relación user para no
        // notificar a co-admins que ya fueron dados de baja. El registro
        // ProjectCoAdmin sigue existiendo (audit) — sólo no notifica.
        prisma.projectCoAdmin.findMany({
          where: { projectId, user: { deletedAt: null } },
          select: {
            user: {
              select: { id: true, email: true, isActive: true, deletedAt: true },
            },
          },
        }),
      fallback: [] as { user: MemberUser }[],
      tag: "chat:getMembers:coAdmins",
    },
    {
      // DISTINCT por currentOwnerId: si un mismo user tiene 50 participations
      // en el proyecto, Prisma devuelve 1 sola fila. Antes el include profundo
      // hidrataba el User completo en cada participation (N copias).
      // Soft-delete: filtramos por currentOwner.deletedAt: null para no
      // notificar holders dados de baja.
      run: () =>
        prisma.participation.findMany({
          where: {
            projectId,
            currentOwnerId: { not: null },
            currentOwner: { deletedAt: null },
          },
          distinct: ["currentOwnerId"],
          select: {
            currentOwner: {
              select: { id: true, email: true, isActive: true, deletedAt: true },
            },
          },
        }),
      fallback: [] as { currentOwner: MemberUser | null }[],
      tag: "chat:getMembers:participationOwners",
    },
  ] as const);

  const byId = new Map<string, string>();

  function maybeAdd(u: MemberUser | null | undefined) {
    if (!u) return;
    if (!u.isActive || u.deletedAt) return;
    if (excludeUserId && u.id === excludeUserId) return;
    byId.set(u.id, u.email);
  }

  maybeAdd(owner);
  for (const ca of coAdmins) maybeAdd(ca.user);
  for (const p of participationRows) maybeAdd(p.currentOwner);

  return Array.from(byId.values());
}
