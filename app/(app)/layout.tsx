import type { Route } from "next";
import { requireSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { SideNav, type NavItem } from "@/components/app/SideNav";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  PROJECT_OWNER: "Founder",
  CO_ADMIN: "Co-admin",
  PARTNER: "Socio",
};

async function navItemsFor(userId: string, role: string): Promise<NavItem[]> {
  const profileItem: NavItem = {
    label: "Mi perfil",
    href: "/perfil" as Route,
    pinBottom: true,
  };
  const settingsItem: NavItem = {
    label: "Configuración",
    href: "/configuracion" as Route,
    pinBottom: true,
  };

  if (role === "ADMIN") {
    const pendingApps = await prisma.application.count({
      where: { status: { in: ["PENDING", "UNDER_REVIEW"] } },
    });
    return [
      { label: "Proyectos", href: "/proyectos" as Route },
      {
        label: "Aplicaciones",
        href: "/admin/applications" as Route,
        badge: pendingApps,
        badgeHighlight: true,
      },
      { label: "Auditoría", href: "/admin/auditoria" as Route },
      profileItem,
      settingsItem,
    ];
  }
  if (role === "PROJECT_OWNER") {
    return [
      { label: "Mi proyecto", href: "/founder" as Route },
      { label: "Explorar", href: "/proyectos" as Route },
      profileItem,
      settingsItem,
    ];
  }
  if (role === "PARTNER") {
    return [
      { label: "Explorar", href: "/proyectos" as Route },
      { label: "Mis participaciones", href: "/partner" as Route },
      profileItem,
      settingsItem,
    ];
  }
  if (role === "CO_ADMIN") {
    return [
      { label: "Proyectos", href: "/proyectos" as Route },
      profileItem,
      settingsItem,
    ];
  }
  return [];
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSession();
  const navItems = await navItemsFor(user.id, user.role);
  const roleLabel = ROLE_LABEL[user.role] ?? user.role;

  return (
    <div className="min-h-screen">
      <SideNav
        user={{ name: user.name ?? user.email, email: user.email }}
        roleLabel={roleLabel}
        navItems={navItems}
      />
      <div className="md:ml-64">
        <main className="px-4 py-8 sm:px-8 md:py-12">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
