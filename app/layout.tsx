import type { Metadata } from "next";
import { Inter, DM_Mono } from "next/font/google";
import "../styles/globals.css";

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
  title: "AJDUT · Sello de Unión",
  description:
    "Comunidad cerrada de proyectos validados. AJDUT no procesa pagos ni custodia fondos. Herramienta de gestión, comunicación y certificación.",
  robots: "noindex,nofollow",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${dmMono.variable}`}>
      <body className="min-h-screen surface-paper" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
