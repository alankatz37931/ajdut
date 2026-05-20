import type { Route } from "next";
import { prisma } from "@/lib/db/client";
import type { NavItem } from "@/components/app/SideNav";
import { getDict } from "@/lib/i18n";

// Role labels (visible en /perfil, /configuracion, etc.). Las claves del
// enum quedan en inglés (ADMIN/PROJECT_OWNER/...); las etiquetas humanas
// son del dict según el idioma activo.
//
// TODO i18n: Si llamadores admin nuevos necesitan etiquetas localizadas,
// usen `getRoleLabel` (async). El export estático `ROLE_LABEL` queda en
// español por compat con audit / admin que están fuera del scope de Ola 7c.
export const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  PROJECT_OWNER: "Founder",
  CO_ADMIN: "Co-admin",
  PARTNER: "Miembro",
};

export async function getRoleLabel(role: string): Promise<string> {
  // El dict no tiene roles aún (admin interno); reuso del estático.
  // TODO i18n: mover a dict.roles cuando se traduzca el área admin.
  return ROLE_LABEL[role] ?? role;
}

/**
 * Construye los items del sidebar según rol. Compartido entre el layout
 * de la app y la página /nosotros (que muestra el mismo chrome si hay sesión).
 *
 * Los labels respetan la preferencia de idioma del viewer (cookie + dict).
 */
export async function navItemsFor(
  role: string,
  userId?: string
): Promise<NavItem[]> {
  const dict = await getDict();
  const n = dict.nav;
  // Cualquier rol que tenga acciones asignadas ve "Mis participaciones",
  // igual que un socio. PARTNER ya lo tiene fijo en su menú.
  const ownsShares =
    !!userId &&
    (await prisma.participation.count({
      where: { currentOwnerId: userId },
    })) > 0;
  const misParticipacionesItem: NavItem = {
    label: n.myParticipations,
    href: "/partner" as Route,
  };

  const profileItem: NavItem = {
    label: n.profile,
    href: "/perfil" as Route,
    pinBottom: true,
  };
  const settingsItem: NavItem = {
    label: n.settings,
    href: "/configuracion" as Route,
    pinBottom: true,
  };
  const nosotrosItem: NavItem = {
    label: n.aboutUs,
    href: "/nosotros" as Route,
    pinBottom: true,
  };
  const legalItem: NavItem = {
    label: n.legalNotice,
    href: "/legal" as Route,
    pinBottom: true,
  };

  if (role === "ADMIN") {
    const [pendingApps, pendingAssignmentsCount, escalatedHeirs] = await Promise.all([
      prisma.application.count({
        where: { status: { in: ["PENDING", "UNDER_REVIEW"] } },
      }),
      prisma.pendingAssignment.count({ where: { status: "PENDING" } }),
      prisma.user.count({
        where: { heirsEscalated: true, isActive: true, deletedAt: null },
      }),
    ]);
    return [
      { label: n.projects, href: "/proyectos" as Route },
      {
        label: n.applications,
        href: "/admin/applications" as Route,
        badge: pendingApps,
        badgeHighlight: true,
      },
      {
        label: n.assignments,
        href: "/admin/asignaciones" as Route,
        badge: pendingAssignmentsCount,
        badgeHighlight: true,
      },
      {
        label: n.heirs,
        href: "/admin/herederos" as Route,
        badge: escalatedHeirs,
        badgeHighlight: true,
      },
      { label: n.audit, href: "/admin/auditoria" as Route },
      { label: n.notices, href: "/admin/avisos" as Route },
      ...(ownsShares ? [misParticipacionesItem] : []),
      profileItem,
      settingsItem,
      nosotrosItem,
      legalItem,
    ];
  }
  if (role === "PROJECT_OWNER") {
    return [
      { label: n.myProject, href: "/founder" as Route },
      { label: n.explore, href: "/proyectos" as Route },
      ...(ownsShares ? [misParticipacionesItem] : []),
      profileItem,
      settingsItem,
      nosotrosItem,
      legalItem,
    ];
  }
  if (role === "PARTNER") {
    return [
      { label: n.explore, href: "/proyectos" as Route },
      { label: n.myParticipations, href: "/partner" as Route },
      profileItem,
      settingsItem,
      nosotrosItem,
      legalItem,
    ];
  }
  if (role === "CO_ADMIN") {
    return [
      { label: n.projects, href: "/proyectos" as Route },
      ...(ownsShares ? [misParticipacionesItem] : []),
      profileItem,
      settingsItem,
      nosotrosItem,
      legalItem,
    ];
  }
  return [];
}
