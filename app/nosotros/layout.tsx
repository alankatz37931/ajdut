import { getOptionalSession } from "@/lib/auth/session";
import { AppShell } from "@/components/app/AppShell";
import { navItemsFor } from "@/components/app/nav-items";
import { PublicNav } from "@/components/landing/PublicNav";
import { PublicFooter } from "@/components/landing/PublicFooter";

/**
 * /nosotros es accesible con o sin sesión:
 *  - Con sesión: mismo chrome que el resto de la app (sidebar).
 *  - Sin sesión: nav/footer públicos.
 */
export default async function NosotrosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getOptionalSession();

  if (user) {
    const navItems = await navItemsFor(user.role);
    return (
      <AppShell
        user={{ name: user.name ?? user.email, email: user.email }}
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
