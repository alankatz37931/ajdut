import { SideNav, type NavItem } from "@/components/app/SideNav";
import { getDict } from "@/lib/i18n";

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
  user: { name: string; email: string };
  navItems: NavItem[];
  children: React.ReactNode;
}) {
  const dict = await getDict();
  return (
    <div className="min-h-screen">
      <SideNav
        user={user}
        navItems={navItems}
        labels={{
          openMenu: dict.nav.openMenu,
          closeMenu: dict.nav.closeMenu,
          logout: dict.nav.logout,
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
