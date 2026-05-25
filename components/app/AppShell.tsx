import { SideNav, type NavItem } from "@/components/app/SideNav";
import { getDict } from "@/lib/i18n";
import { getRoleLabel } from "@/components/app/nav-items";

/**
 * Chrome de la app autenticada: sidebar + main. Compartido entre el layout
 * de (app) y la página /nosotros cuando hay sesión, para que se vea igual
 * que el resto de las secciones.
 *
 * Carga el sub-dict de nav y se lo pasa a SideNav (client) para que los
 * aria-labels y "Cerrar sesión" respeten la preferencia del viewer.
 */
export async function AppShell({
  user,
  navItems,
  children,
}: {
  user: {
    name: string;
    email: string;
    avatarUrl?: string | null;
    /** Rol del viewer — para mostrar la etiqueta humanizada bajo el logo. */
    role: string;
  };
  navItems: NavItem[];
  children: React.ReactNode;
}) {
  const [dict, roleLabel] = await Promise.all([
    getDict(),
    getRoleLabel(user.role),
  ]);
  return (
    <div className="min-h-screen">
      <SideNav
        user={{
          name: user.name,
          email: user.email,
          avatarUrl: user.avatarUrl,
          roleLabel,
        }}
        navItems={navItems}
        labels={{
          openMenu: dict.nav.openMenu,
          closeMenu: dict.nav.closeMenu,
          logout: dict.nav.logout,
          brandTagline: dict.brand.tagline,
          brandAriaLabel: dict.brand.ariaLabel,
        }}
      />
      <div className="md:ml-64">
        <main className="px-4 py-6 sm:px-8 md:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
