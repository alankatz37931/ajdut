/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  images: {
    remotePatterns: [
      // Vercel Blob — avatares de usuario y documentos de proyecto.
      // Hostname real: <store-id-hash>.public.blob.vercel-storage.com
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
  experimental: {
    // Cache cliente del router más agresivo: páginas recién visitadas
    // siguen "frescas" sin re-fetch durante el TTL.
    //   static: rutas estáticas → 5 minutos
    //   dynamic: rutas dinámicas → 30s (data fresca pero no en cada click)
    staleTimes: {
      static: 300,
      dynamic: 30,
    },
  },
};

export default nextConfig;
