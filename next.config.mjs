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
  // Headers de seguridad básicos para todo /(.*).
  // TODO CSP en proxima ola — requiere nonces para inline scripts y allowlisting de YouTube/Vimeo
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            // 2 años + subdominios + preload list. Solo aplica sobre HTTPS,
            // navegadores lo ignoran en localhost / IP.
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            // Frena MIME sniffing — el browser respeta el Content-Type que
            // mandamos y no infiere "esto parece HTML, lo ejecuto".
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            // Clickjacking: AJDUT nunca debe poder embebese en iframe externo.
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            // Mandamos origin + path solo a same-origin; a cross-origin
            // mandamos solo el origin. Evita filtrar paths privados al salir.
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            // Bloquea API browser-side que no usamos. Si en el futuro
            // necesitamos cámara/mic/geo, hay que abrir explícito acá.
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
