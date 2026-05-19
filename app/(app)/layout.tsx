import { requireSession } from "@/lib/auth/session";
import { AppShell } from "@/components/app/AppShell";
import { navItemsFor } from "@/components/app/nav-items";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSession();
  const navItems = await navItemsFor(user.role, user.id);

  return (
    <AppShell
      user={{ name: user.name ?? user.email, email: user.email }}
      navItems={navItems}
    >
      {children}
    </AppShell>
  );
}
