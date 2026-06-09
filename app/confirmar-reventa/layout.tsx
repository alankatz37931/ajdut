import { PublicNav } from "@/components/landing/PublicNav";
import { PublicFooter } from "@/components/landing/PublicFooter";

/**
 * Layout público de la confirmación del comprador en una reventa. El comprador
 * NO necesita estar logueado para confirmar — sólo tener el link de un solo uso
 * que llegó por mail. Misma estructura que `confirmar-asignacion`.
 */
export default function ConfirmReventaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicNav />
      <main className="flex flex-1 items-center justify-center py-4">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
