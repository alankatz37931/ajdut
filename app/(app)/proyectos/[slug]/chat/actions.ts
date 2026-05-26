"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { sequentialPrisma } from "@/lib/prisma/safe";
import { getDict } from "@/lib/i18n";
import {
  ensureChannelForProject,
  postMessage,
  softDeleteMessage,
  createPoll,
  votePoll,
  closePoll,
  isChannelMember,
  getChannelMemberEmails,
} from "@/lib/services/chat";
import { DomainError } from "@/lib/services/errors";
import { notifyChannelNewMessage } from "@/lib/email/notifications";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; code?: string };

async function resolveProjectOrFail(slug: string) {
  const project = await prisma.project.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, ownerId: true },
  });
  if (!project) {
    const dict = await getDict();
    return { ok: false as const, error: dict.chat.errors.projectNotFound, code: "NOT_FOUND" };
  }
  return { ok: true as const, project };
}

function revalidateChat(slug: string) {
  revalidatePath(`/proyectos/${slug}/chat`);
}

// ─── Mensajes ──────────────────────────────────────────────────────

export async function postMessageAction(
  projectSlug: string,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSession();
  const r = await resolveProjectOrFail(projectSlug);
  if (!r.ok) return r;
  const { project } = r;

  const body = String(formData.get("body") ?? "");
  const attachmentUrl = String(formData.get("attachmentUrl") ?? "").trim();

  if (!(await isChannelMember(project.id, user.id))) {
    const dict = await getDict();
    return { ok: false, error: dict.chat.errors.forbidden, code: "FORBIDDEN" };
  }

  const channel = await ensureChannelForProject(project.id);

  let created;
  try {
    created = await postMessage({
      channelId: channel.id,
      authorId: user.id,
      body,
      attachmentUrl: attachmentUrl || null,
    });
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message, code: e.code };
    console.error(e);
    const dict = await getDict();
    return { ok: false, error: dict.chat.errors.internal };
  }

  revalidateChat(projectSlug);

  // Email a los demás miembros — fire-and-forget, sin spam en dev.
  // Aunque corre dentro de `after()` (no bloquea la respuesta), seguimos
  // usando sequentialPrisma: con connection_limit=1, dos lecturas en paralelo
  // se pisan el pool. Además si una falla queremos seguir con el resto.
  after(async () => {
    const [author, recipients] = await sequentialPrisma([
      {
        run: () =>
          prisma.user.findUnique({
            where: { id: user.id },
            select: { fullName: true, alias: true },
          }),
        fallback: null as { fullName: string; alias: string | null } | null,
        tag: "chatActions:postMessage:author",
      },
      {
        run: () => getChannelMemberEmails(project.id, user.id),
        fallback: [] as string[],
        tag: "chatActions:postMessage:recipients",
      },
    ] as const);
    if (!author || recipients.length === 0) return;
    const displayName = author.alias ?? author.fullName;
    const preview =
      created.body && created.body.length > 0
        ? created.body.length > 220
          ? `${created.body.slice(0, 220)}…`
          : created.body
        : "(archivo adjunto)";
    await notifyChannelNewMessage({
      to: recipients,
      projectSlug: project.slug,
      projectName: project.name,
      authorName: displayName,
      bodyPreview: preview,
      attachmentUrl: created.attachmentUrl ?? null,
    });
  });

  return { ok: true };
}

export async function deleteMessageAction(
  projectSlug: string,
  messageId: string
): Promise<ActionResult> {
  const user = await requireSession();
  const r = await resolveProjectOrFail(projectSlug);
  if (!r.ok) return r;

  try {
    await softDeleteMessage({ messageId, actorId: user.id });
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message, code: e.code };
    console.error(e);
    const dict = await getDict();
    return { ok: false, error: dict.chat.errors.internal };
  }

  revalidateChat(projectSlug);
  return { ok: true };
}

// ─── Polls ─────────────────────────────────────────────────────────

export async function createPollAction(
  projectSlug: string,
  formData: FormData
): Promise<ActionResult> {
  const user = await requireSession();
  const r = await resolveProjectOrFail(projectSlug);
  if (!r.ok) return r;
  const { project } = r;

  const question = String(formData.get("question") ?? "");
  const multiple = formData.get("multiple") === "on" || formData.get("multiple") === "true";
  const closesAtRaw = String(formData.get("closesAt") ?? "").trim();

  // Las opciones llegan como `option` repetido (input[name="option"]).
  const options = formData.getAll("option").map((v) => String(v ?? ""));

  let closesAt: Date | null = null;
  if (closesAtRaw) {
    const parsed = new Date(closesAtRaw);
    if (Number.isNaN(parsed.getTime())) {
      const dict = await getDict();
      return { ok: false, error: dict.chat.errors.invalidCloseDate, code: "VALIDATION" };
    }
    closesAt = parsed;
  }

  const channel = await ensureChannelForProject(project.id);

  try {
    await createPoll({
      channelId: channel.id,
      createdById: user.id,
      question,
      options,
      multiple,
      closesAt,
    });
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message, code: e.code };
    console.error(e);
    const dict = await getDict();
    return { ok: false, error: dict.chat.errors.internal };
  }

  revalidateChat(projectSlug);
  return { ok: true };
}

export async function votePollAction(
  projectSlug: string,
  pollId: string,
  optionId: string
): Promise<ActionResult> {
  const user = await requireSession();
  const r = await resolveProjectOrFail(projectSlug);
  if (!r.ok) return r;

  try {
    await votePoll({ pollId, optionId, voterId: user.id });
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message, code: e.code };
    console.error(e);
    const dict = await getDict();
    return { ok: false, error: dict.chat.errors.internal };
  }

  revalidateChat(projectSlug);
  return { ok: true };
}

export async function closePollAction(
  projectSlug: string,
  pollId: string
): Promise<ActionResult> {
  const user = await requireSession();
  const r = await resolveProjectOrFail(projectSlug);
  if (!r.ok) return r;

  try {
    await closePoll({ pollId, actorId: user.id });
  } catch (e) {
    if (e instanceof DomainError) return { ok: false, error: e.message, code: e.code };
    console.error(e);
    const dict = await getDict();
    return { ok: false, error: dict.chat.errors.internal };
  }

  revalidateChat(projectSlug);
  return { ok: true };
}
