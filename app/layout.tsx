import type { Metadata } from "next";
import { Inter, DM_Mono } from "next/font/google";
import "../styles/globals.css";
// NOTE: i18n cookie no se lee acá. El root layout debe permanecer estático
// para no romper la prerenderización (mismo motivo por el que el tema se
// inyecta vía script bloqueante en el body). El `lang` queda en "es" — el
// contenido inglés se sirve correctamente igual; un futuro Ola 7d puede
// promover esto a dinámico vía generateMetadata / route handler dedicado.

// Modo oscuro deshabilitado a nivel producto. Script que asegura que la
// clase `dark` jamás esté presente, aunque exista una cookie/clase vieja
// de versiones anteriores. Corre síncrono antes del primer paint.
const THEME_INIT = `(function(){try{document.documentElement.classList.remove('dark')}catch(e){}})();`;

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const dmMono = DM_Mono({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-dm-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AJDUT",
  description:
    "Donde proyectos reales encuentran a su comunidad. AJDUT conecta emprendedores con miembros que quieren aportar a proyectos reales — startups, inmobiliarios o de mercancía.",
  robots: "noindex,nofollow",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`${inter.variable} ${dmMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen surface-paper" suppressHydrationWarning>
        {/* Script bloqueante: corre síncrono antes de pintar el contenido,
            así no hay FOUC. Va en <body> (no en un <head> manual) para no
            chocar con el manejo de <head> del App Router → sin mismatch. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        {children}
      </body>
    </html>
  );
}
