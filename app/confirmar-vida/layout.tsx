import { PublicNav } from "@/components/landing/PublicNav";
import { PublicFooter } from "@/components/landing/PublicFooter";

/**
 * Layout público para /confirmar-vida/[id]. La ruta es accesible sin sesión
 * (la valida un token simple — el id del ValidationCheck), igual que
 * /establecer-contrasena. Usa el chrome público para que el email no
 * descargue al usuario a una pantalla rara.
 */
export default function ConfirmarVidaLayout({
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
