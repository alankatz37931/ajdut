import { getOptionalSession } from "@/lib/auth/session";
import { AppShell } from "@/components/app/AppShell";
import { navItemsFor } from "@/components/app/nav-items";
import { PublicNav } from "@/components/landing/PublicNav";
import { PublicFooter } from "@/components/landing/PublicFooter";
import { prisma } from "@/lib/db/client";
import { safePrisma } from "@/lib/prisma/safe";

/**
 * /legal es accesible con o sin sesión:
 *  - Con sesión: mismo chrome que el resto de la app (sidebar).
 *  - Sin sesión: nav/footer públicos.
 */
export default async function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getOptionalSession();

  if (user) {
    // Secuencial: con connection_limit=1 paralelizar el sidebar (varios counts
    // dentro de navItemsFor) y el avatar agota el pool y dispara timeout. El
    // avatar va envuelto en safePrisma — si falla, SideNav cae a iniciales.
    const navItems = await navItemsFor(user.role, user.id);
    const dbUser = await safePrisma(
      () =>
        prisma.user.findUnique({
          where: { id: user.id },
          select: { avatarUrl: true },
        }),
      null,
      "legalLayout:avatar"
    );
    return (
      <AppShell
        user={{
          name: user.name ?? user.email,
          email: user.email,
          avatarUrl: dbUser?.avatarUrl ?? null,
          role: user.role,
        }}
        navItems={navItems}
      >
        {children}
      </AppShell>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <PublicNav />
      <main className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}
