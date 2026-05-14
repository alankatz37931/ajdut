import { prisma } from "@/lib/db/client";

export type ProjectAccessRole =
  | "ADMIN"
  | "OWNER"
  | "CO_ADMIN"
  | "PARTNER"
  | "VIEWER"      // cualquier usuario autenticado que no encaja en otra categoría
  | "NONE";

export type ProjectAccess = {
  role: ProjectAccessRole;
  canView: boolean;
  canEdit: boolean;
  canSeeCapTable: boolean;
  canSeePrivateMetrics: boolean;
  canManifestInterest: boolean;
};

/**
 * Decide qué puede ver el viewer en un proyecto dado.
 *
 * Reglas (AJDUT v1, modelo "marketplace de descubrimiento"):
 *  - Editar: SOLO el founder dueño del proyecto.
 *  - Ver proyecto ACTIVE: cualquier usuario autenticado (público dentro de la app).
 *  - Comprar/manifestar interés: cualquier usuario autenticado EXCEPTO el propio dueño.
 *  - Cap table y métricas privadas: solo Admin + Owner (info sensible).
 */
export async function getProjectAccess(args: {
  userId: string;
  userRole: "ADMIN" | "PROJECT_OWNER" | "CO_ADMIN" | "PARTNER" | "PLATFORM";
  projectId: string;
  ownerId: string;
  projectStatus: string;
}): Promise<ProjectAccess> {
  const isActive = args.projectStatus === "ACTIVE";

  // Owner del proyecto → control total de contenido, sin manifestar interés sobre sí mismo
  if (args.ownerId === args.userId) {
    return {
      role: "OWNER",
      canView: true,
      canEdit: true,
      canSeeCapTable: true,
      canSeePrivateMetrics: true,
      canManifestInterest: false,
    };
  }

  // PLATFORM user no participa visualmente en ningún flujo
  if (args.userRole === "PLATFORM") {
    return {
      role: "NONE",
      canView: false,
      canEdit: false,
      canSeeCapTable: false,
      canSeePrivateMetrics: false,
      canManifestInterest: false,
    };
  }

  // Admin → moderación. Ve todo (incluye cap table) pero NO edita contenido.
  if (args.userRole === "ADMIN") {
    return {
      role: "ADMIN",
      canView: true,
      canEdit: false,
      canSeeCapTable: true,
      canSeePrivateMetrics: true,
      canManifestInterest: isActive,
    };
  }

  // Co-admin asignado: lectura ampliada (cap table), sin edit, sin comprar
  if (args.userRole === "CO_ADMIN") {
    const link = await prisma.projectCoAdmin.findUnique({
      where: { projectId_userId: { projectId: args.projectId, userId: args.userId } },
    });
    if (link) {
      return {
        role: "CO_ADMIN",
        canView: true,
        canEdit: false,
        canSeeCapTable: true,
        canSeePrivateMetrics: true,
        canManifestInterest: isActive,
      };
    }
  }

  // Cualquier otro usuario autenticado (PARTNER, PROJECT_OWNER de OTRO proyecto, CO_ADMIN no vinculado):
  // si el proyecto está ACTIVE, puede verlo y manifestar interés.
  if (isActive) {
    return {
      role: args.userRole === "PARTNER" ? "PARTNER" : "VIEWER",
      canView: true,
      canEdit: false,
      canSeeCapTable: false,
      canSeePrivateMetrics: false,
      canManifestInterest: true,
    };
  }

  // Proyecto no activo y el viewer no tiene rol especial → sin acceso
  return {
    role: "NONE",
    canView: false,
    canEdit: false,
    canSeeCapTable: false,
    canSeePrivateMetrics: false,
    canManifestInterest: false,
  };
}
