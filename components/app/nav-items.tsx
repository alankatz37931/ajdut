import type { Route } from "next";
import { prisma } from "@/lib/db/client";
import type { NavItem } from "@/components/app/SideNav";
import { getDict } from "@/lib/i18n";
import type { Dict } from "@/lib/i18n";
import {
  ProjectsIcon,
  MyProjectIcon,
  ParticipationsIcon,
  ApplicationsIcon,
  AssignmentsIcon,
  HeirsIcon,
  AuditIcon,
  NoticesIcon,
  ProfileIcon,
  SettingsIcon,
  AboutIcon,
  LegalIcon,
} from "@/components/app/nav-icons";

// Role labels (visible en /perfil, /configuracion, etc.). Las claves del
// enum quedan en inglés (ADMIN/PROJECT_OWNER/...); las etiquetas humanas
// son del dict según el idioma activo.
//
// TODO i18n: Si llamadores admin nuevos necesitan etiquetas localizadas,
// usen `getRoleLabel` (async). El export estático `ROLE_LABEL` queda en
// español por compat con audit / admin que están fuera del scope de Ola 7c.
export const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  PROJECT_OWNER: "Project owner",
  CO_ADMIN: "Co-admin",
  PARTNER: "Miembro",
};

export async function getRoleLabel(role: string): Promise<string> {
  const dict = await getDict();
  const dictRoles = dict.roles as Record<keyof Dict["roles"] | string, string>;
  return dictRoles[role] ?? ROLE_LABEL[role] ?? role;
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
  const SEC_ADMIN = n.sectionAdministration;
  const SEC_PORTFOLIO = n.sectionPortfolio;
  const SEC_ACCOUNT = n.sectionAccount;

  // Cualquier rol que tenga acciones asignadas ve "Mis participaciones",
  // igual que un socio. PARTNER ya lo tiene fijo en su menú. Lo computamos
  // dentro de cada Promise.all por rol para no serializar y agotar el pool.
  async function fetchOwnsShares(): Promise<boolean> {
    if (!userId) return false;
    try {
      const n = await prisma.participation.count({
        where: { currentOwnerId: userId },
      });
      return n > 0;
    } catch {
      // Pool agotado o cualquier error de DB: el sidebar no es crítico,
      // preferimos que la página renderee a tirar todo abajo. En el peor
      // caso el viewer no ve "Mis participaciones" hasta el próximo render.
      return false;
    }
  }

  const misParticipacionesItem: NavItem = {
    label: n.myParticipations,
    href: "/partner" as Route,
    group: SEC_PORTFOLIO,
    icon: <ParticipationsIcon />,
  };

  const documentosItem: NavItem = {
    label: n.documents,
    href: "/documentos" as Route,
    group: SEC_PORTFOLIO,
    icon: <AuditIcon />,
  };

  const historialItem: NavItem = {
    label: n.history,
    href: "/historial" as Route,
    group: SEC_PORTFOLIO,
    icon: <AssignmentsIcon />,
  };

  // CUENTA — perfil + configuración. Quedan agrupados bajo su sección.
  const profileItem: NavItem = {
    label: n.profile,
    href: "/perfil" as Route,
    group: SEC_ACCOUNT,
    icon: <ProfileIcon />,
  };
  const settingsItem: NavItem = {
    label: n.settings,
    href: "/configuracion" as Route,
    group: SEC_ACCOUNT,
    icon: <SettingsIcon />,
  };

  // INSTITUCIONAL — sobre nosotros + aviso legal. Van pinBottom, sin
  // section header, con peso visual reducido (lo aplica SideNav).
  const nosotrosItem: NavItem = {
    label: n.aboutUs,
    href: "/nosotros" as Route,
    pinBottom: true,
    icon: <AboutIcon />,
  };
  const legalItem: NavItem = {
    label: n.legalNotice,
    href: "/legal" as Route,
    pinBottom: true,
    icon: <LegalIcon />,
  };

  if (role === "ADMIN") {
    const [
      pendingApps,
      pendingAssignmentsCount,
      escalatedHeirs,
      pendingResales,
      ownsShares,
    ] = await Promise.all([
      prisma.application.count({
        where: { status: { in: ["PENDING", "UNDER_REVIEW"] } },
      }),
      prisma.pendingAssignment.count({ where: { status: "PENDING" } }),
      prisma.user.count({
        where: { heirsEscalated: true, isActive: true, deletedAt: null },
      }),
      prisma.resaleListing.count({
        where: { status: "AWAITING_VALIDATION" },
      }),
      fetchOwnsShares(),
    ]);
    return [
      // PORTAFOLIO
      { label: n.projects, href: "/proyectos" as Route, group: SEC_PORTFOLIO, icon: <ProjectsIcon /> },
      ...(ownsShares ? [misParticipacionesItem, documentosItem, historialItem] : []),
      // ADMINISTRACIÓN
      {
        label: n.applications,
        href: "/admin/applications" as Route,
        badge: pendingApps,
        badgeHighlight: true,
        group: SEC_ADMIN,
        icon: <ApplicationsIcon />,
      },
      {
        label: n.assignments,
        href: "/admin/asignaciones" as Route,
        badge: pendingAssignmentsCount,
        badgeHighlight: true,
        group: SEC_ADMIN,
        icon: <AssignmentsIcon />,
      },
      {
        label: n.resales,
        href: "/admin/reventas" as Route,
        badge: pendingResales,
        badgeHighlight: true,
        group: SEC_ADMIN,
        icon: <AssignmentsIcon />,
      },
      {
        label: n.heirs,
        href: "/admin/herederos" as Route,
        badge: escalatedHeirs,
        badgeHighlight: true,
        group: SEC_ADMIN,
        icon: <HeirsIcon />,
      },
      { label: n.audit, href: "/admin/auditoria" as Route, group: SEC_ADMIN, icon: <AuditIcon /> },
      { label: n.notices, href: "/admin/avisos" as Route, group: SEC_ADMIN, icon: <NoticesIcon /> },
      // CUENTA
      profileItem,
      settingsItem,
      // INSTITUCIONAL
      nosotrosItem,
      legalItem,
    ];
  }
  if (role === "PROJECT_OWNER") {
    const ownsShares = await fetchOwnsShares();
    return [
      { label: n.myProject, href: "/founder" as Route, group: SEC_PORTFOLIO, icon: <MyProjectIcon /> },
      { label: n.explore, href: "/proyectos" as Route, group: SEC_PORTFOLIO, icon: <ProjectsIcon /> },
      // Documentos / Historial solo si el founder tiene shares de algún otro
      // proyecto (rol mixto). Como dueño del proyecto los ve dentro de la
      // propia ficha founder, no globalmente.
      ...(ownsShares ? [misParticipacionesItem, documentosItem, historialItem] : []),
      profileItem,
      settingsItem,
      nosotrosItem,
      legalItem,
    ];
  }
  if (role === "PARTNER") {
    return [
      { label: n.explore, href: "/proyectos" as Route, group: SEC_PORTFOLIO, icon: <ProjectsIcon /> },
      { label: n.myParticipations, href: "/partner" as Route, group: SEC_PORTFOLIO, icon: <ParticipationsIcon /> },
      documentosItem,
      historialItem,
      profileItem,
      settingsItem,
      nosotrosItem,
      legalItem,
    ];
  }
  if (role === "CO_ADMIN") {
    const ownsShares = await fetchOwnsShares();
    return [
      { label: n.projects, href: "/proyectos" as Route, group: SEC_PORTFOLIO, icon: <ProjectsIcon /> },
      ...(ownsShares ? [misParticipacionesItem, documentosItem, historialItem] : []),
      profileItem,
      settingsItem,
      nosotrosItem,
      legalItem,
    ];
  }
  return [];
}
