/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  typedRoutes: true,
  images: {
    remotePatterns: [],
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
