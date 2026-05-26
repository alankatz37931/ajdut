import { requireSession } from "@/lib/auth/session";
import { AppShell } from "@/components/app/AppShell";
import { navItemsFor } from "@/components/app/nav-items";
import { prisma } from "@/lib/db/client";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSession();
  // Sequential: con DATABASE_URL?connection_limit=1 los Promise.all entre
  // varias queries acumulan timeout. Una conexión a la vez evita que el
  // sidebar y el header del avatar peleen por el pool.
  const navItems = await navItemsFor(user.role, user.id);
  let avatarUrl: string | null = null;
  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { avatarUrl: true },
    });
    avatarUrl = dbUser?.avatarUrl ?? null;
  } catch {
    // Si falla la query del avatar dejamos null — el SideNav muestra iniciales.
    avatarUrl = null;
  }

  return (
    <AppShell
      user={{
        name: user.name ?? user.email,
        email: user.email,
        avatarUrl,
        role: user.role,
      }}
      navItems={navItems}
    >
      {children}
    </AppShell>
  );
}
