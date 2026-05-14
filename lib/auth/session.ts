import { redirect } from "next/navigation";
import { auth } from "./index";

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "PROJECT_OWNER" | "CO_ADMIN" | "PARTNER";
};

export async function requireSession(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/acceder");
  }
  return session.user as SessionUser;
}

export async function requireRole(allowed: SessionUser["role"][]): Promise<SessionUser> {
  const user = await requireSession();
  if (!allowed.includes(user.role)) {
    // Mandamos al dispatcher por rol — no a la landing pública. Así un PARTNER
    // que pincha por error una URL de admin termina en /partner, no en "/".
    redirect("/redirect-by-role");
  }
  return user;
}

export async function getOptionalSession(): Promise<SessionUser | null> {
  const session = await auth();
  return (session?.user as SessionUser | undefined) ?? null;
}
