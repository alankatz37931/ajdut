import type { Route } from "next";
import { prisma } from "@/lib/db/client";
import type { NavItem } from "@/components/app/SideNav";

export const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  PROJECT_OWNER: "Founder",
  CO_ADMIN: "Co-admin",
  PARTNER: "Miembro",
};

/**
 * Construye los items del sidebar según rol. Compartido entre el layout
 * de la app y la página /nosotros (que muestra el mismo chrome si hay sesión).
 */
export async function navItemsFor(
  role: string,
  userId?: string
): Promise<NavItem[]> {
  // Cualquier rol que tenga acciones asignadas ve "Mis participaciones",
  // igual que un socio. PARTNER ya lo tiene fijo en su menú.
  const ownsShares =
    !!userId &&
    (await prisma.participation.count({
      where: { currentOwnerId: userId },
    })) > 0;
  const misParticipacionesItem: NavItem = {
    label: "Mis participaciones",
    href: "/partner" as Route,
  };

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
  const nosotrosItem: NavItem = {
    label: "Sobre nosotros",
    href: "/nosotros" as Route,
    pinBottom: true,
  };
  const legalItem: NavItem = {
    label: "Aviso legal",
    href: "/legal" as Route,
    pinBottom: true,
  };

  if (role === "ADMIN") {
    const [pendingApps, pendingAssignmentsCount] = await Promise.all([
      prisma.application.count({
        where: { status: { in: ["PENDING", "UNDER_REVIEW"] } },
      }),
      prisma.pendingAssignment.count({ where: { status: "PENDING" } }),
    ]);
    return [
      { label: "Proyectos", href: "/proyectos" as Route },
      {
        label: "Aplicaciones",
        href: "/admin/applications" as Route,
        badge: pendingApps,
        badgeHighlight: true,
      },
      {
        label: "Asignaciones",
        href: "/admin/asignaciones" as Route,
        badge: pendingAssignmentsCount,
        badgeHighlight: true,
      },
      { label: "Auditoría", href: "/admin/auditoria" as Route },
      { label: "Avisos", href: "/admin/avisos" as Route },
      ...(ownsShares ? [misParticipacionesItem] : []),
      profileItem,
      settingsItem,
      nosotrosItem,
      legalItem,
    ];
  }
  if (role === "PROJECT_OWNER") {
    return [
      { label: "Mi proyecto", href: "/founder" as Route },
      { label: "Explorar", href: "/proyectos" as Route },
      ...(ownsShares ? [misParticipacionesItem] : []),
      profileItem,
      settingsItem,
      nosotrosItem,
      legalItem,
    ];
  }
  if (role === "PARTNER") {
    return [
      { label: "Explorar", href: "/proyectos" as Route },
      { label: "Mis participaciones", href: "/partner" as Route },
      profileItem,
      settingsItem,
      nosotrosItem,
      legalItem,
    ];
  }
  if (role === "CO_ADMIN") {
    return [
      { label: "Proyectos", href: "/proyectos" as Route },
      ...(ownsShares ? [misParticipacionesItem] : []),
      profileItem,
      settingsItem,
      nosotrosItem,
      legalItem,
    ];
  }
  return [];
}
