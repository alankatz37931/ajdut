import { requireSession } from "@/lib/auth/session";
import { AppShell } from "@/components/app/AppShell";
import { navItemsFor } from "@/components/app/nav-items";
import { prisma } from "@/lib/db/client";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSession();
  const [navItems, dbUser] = await Promise.all([
    navItemsFor(user.role, user.id),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { avatarUrl: true },
    }),
  ]);

  return (
    <AppShell
      user={{
        name: user.name ?? user.email,
        email: user.email,
        avatarUrl: dbUser?.avatarUrl ?? null,
      }}
      navItems={navItems}
    >
      {children}
    </AppShell>
  );
}
