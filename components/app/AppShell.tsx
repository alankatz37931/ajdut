import { SideNav, type NavItem } from "@/components/app/SideNav";

/**
 * Chrome de la app autenticada: sidebar + main. Compartido entre el layout
 * de (app) y la página /nosotros cuando hay sesión, para que se vea igual
 * que el resto de las secciones.
 */
export function AppShell({
  user,
  navItems,
  children,
}: {
  user: { name: string; email: string };
  navItems: NavItem[];
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <SideNav user={user} navItems={navItems} />
      <div className="md:ml-64">
        <main className="px-4 py-6 sm:px-8 md:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
