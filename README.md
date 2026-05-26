# AJDUT

Sistema de gestión de comunidades de negocio. Cero transacciones, máxima trazabilidad.

> AJDUT no procesa pagos ni custodia fondos. Es la herramienta de gestión, comunicación y certificación que respalda proyectos reales — startups, inmobiliarios y de mercancía — para sus socios.

---

## Stack

- **Next.js 15** (App Router, TypeScript estricto, React 19 RC)
- **Prisma 5** + **PostgreSQL** (sugerido Neon para dev y prod)
- **Auth.js v5** (email + password)
- **Tailwind CSS 3** con tokens de diseño AJDUT (paleta Sello de Unión)
- **Decimal.js** para todas las cifras monetarias
- **Zod** para validación de entrada
- **bcryptjs** para hashing de contraseñas

---

## Puesta en marcha

### Pre-requisitos

- Node.js ≥ 20
- pnpm ≥ 9
- PostgreSQL accesible (local, Neon, Supabase, Railway, etc.)

### Pasos

```bash
# 1. Instalar dependencias
pnpm install

# 2. Copiar plantilla de variables de entorno
cp .env.example .env
# Editar .env con tu DATABASE_URL y AUTH_SECRET (generar con: openssl rand -base64 32)

# 3. Generar el cliente Prisma y aplicar schema
pnpm db:generate
pnpm db:push

# 4. Cargar datos de demostración
pnpm db:seed

# 5. Arrancar dev server
pnpm dev
```

Abre [http://localhost:3000](http://localhost:3000).

### Credenciales de demo (tras el seed)

| Rol      | Email                  | Contraseña            |
| -------- | ---------------------- | --------------------- |
| Admin    | `admin@ajdut.io`       | `cambia-esto-tras-primer-login` |
| Admin 2  | `admin2@ajdut.io`      | `cambia-esto-tras-primer-login` |
| Founder  | `lucia@pushka.demo`    | `ajdut-demo-2026`     |
| Socios   | `ana@socios.demo`, `diego@socios.demo`, `mariana@socios.demo`, `carlos@socios.demo`, `valeria@socios.demo` | `ajdut-demo-2026` |

---

## Estructura del repo

```
app/
├── (public)/            Landing pública y aviso legal (force-static)
├── (auth)/              /acceder y /aplicar
├── (app)/               Rutas protegidas
│   ├── founder/         Dashboard del founder
│   ├── partner/         Dashboard del socio
│   └── admin/           Consola Admin
├── api/auth/[...nextauth]/  Handlers Auth.js
└── redirect-by-role/    Router de roles tras login

components/
├── landing/             BrandMark, PublicNav, PublicFooter
├── ui/                  Section, etc.
└── (founder|partner|admin)/  Vistas específicas por rol

lib/
├── auth/                Auth.js v5 config, session helpers
├── crypto/              Cadena de hashes de OwnershipHistory
├── constants/           Constantes (usuario PLATFORM, LEAD_EXPIRATION_DAYS, …)
├── db/                  Cliente Prisma singleton
└── utils/               Formateo de cifras, cn() para Tailwind

prisma/
├── schema.prisma        Schema completo
└── seed.ts              Datos de demo
```

---

## Filosofía de diseño

### Cero Transacciones
El sistema NO procesa pagos, NO custodia fondos y NO es un exchange. Es herramienta de gestión, comunicación y certificación. Las distribuciones de dividendos se declaran, se comunican y se confirman; nunca se mueven dentro de la plataforma.

### Trazabilidad de Legado
Cada cambio de propiedad genera un registro inmutable en `OwnershipHistory` con cadena de hashes SHA-256. No se borran datos; se crean nuevos estados de propiedad.

### Gatekeeping Estricto
No existe registro abierto. El acceso requiere completar `/aplicar` y ser aprobado manualmente por un Admin.

### Stake Institucional 10%
AJDUT mantiene el 10% de cada startup que activa un proyecto en la plataforma, modelado como `User` con rol `PLATFORM` que posee `Participation` con `isPlatformStake = true`. Estas participaciones quedan locked para reventa y solo pueden transferirse con doble firma de Admins.

### Doble Firma
Toda transferencia de una participación institucional requiere `authorizedById` + `coAuthorizedById` (dos Admins distintos). Validado a nivel de servicio.

---

## Identidad visual

| Token                | Valor       | Uso                                   |
| -------------------- | ----------- | ------------------------------------- |
| `paper`              | `#F5F3EE`   | Fondo principal                       |
| `navy`               | `#1A1A2E`   | Headers y énfasis                     |
| `gold`               | `#C8A96E`   | Solo para datos de valor (KPIs, base "U" del logo) |
| `line`               | `#E8E3D9`   | Retículas de 0.5pt                    |
| `font-sans` (Inter)  | —           | Cuerpo de texto                       |
| `font-mono` (DM Mono)| —           | Cifras, métricas y eyebrows           |

---

## Próximos pasos pendientes (TODO)

### Funcionalidad

- [ ] `ParticipationService.transition()` con guards de máquina de estados
- [ ] `DividendService` con cálculo de prorrateo y residual al stake institucional
- [ ] `ProjectApprovalService` con emisión automática del 10% al pasar a ACTIVE
- [ ] Formulario `/founder/[projectSlug]/distributions/new` con preview en vivo
- [ ] Gestión de pagos individuales (founder marca SENT, partner marca RECEIVED)
- [ ] Tablón de reventa (sin precio sugerido, A2)
- [ ] Flujo de transferencia con firma electrónica in-app de ambas partes (B4)
- [ ] Checkbox ROFR del founder antes de TRANSFER_PENDING (B5)
- [ ] Application review con tres stages: PENDING → UNDER_REVIEW → APPROVED/REJECTED
- [ ] Generación de Certificate PDF con marca de agua dinámica
- [ ] URLs firmadas con TTL 15min para documentos privados
- [ ] Chat en tiempo real (Pusher) por proyecto
- [ ] Notificaciones in-app + email (Resend)
- [ ] Vista de socio con dividendos (confirmar recepción, disputar)
- [ ] Consolidado anual PDF descargable por socio (A10)
- [ ] Cap table detallado oculto para socios (A1)
- [ ] Métricas con `visibility` (A4) — query del socio filtra a `PUBLIC_TO_HOLDERS`
- [ ] Exportación CSV de auditoría
- [ ] PDF firmado mensual de auditoría

### Infraestructura

- [ ] Configuración real de Cloudflare R2 (storage privado de documentos)
- [ ] Configuración real de Resend (templates en React Email)
- [ ] Configuración real de Pusher Channels
- [ ] Configuración real de Sentry
- [ ] CI/CD con GitHub Actions
- [ ] Migraciones Prisma en preview branches de Vercel

### Compliance pendiente (no-código)

- [ ] Platform Equity Agreement plantilla legal
- [ ] Aviso legal con asesoría jurídica real
- [ ] Política de retenciones fiscales por jurisdicción
- [ ] Revisión securities-law de la estructura del 10%
- [ ] KYC manual proceso operativo

### Diferido a v1.1

- [ ] KYC integrado con proveedor (Persona / Onfido / Sumsub / Truora)
- [ ] Constancias fiscales tipo 1099 / Form 1042-S
- [ ] Marketplace público de proyectos
- [ ] App móvil nativa
- [ ] Multi-jurisdicción / multi-tenant
- [ ] Pseudonimización GDPR
- [ ] Votaciones / gobernanza de accionistas

---

## Decisiones de producto registradas

- **A1** Los socios NO ven a otros socios del proyecto.
- **A2** Las reventas se publican sin precio sugerido; solo intención.
- **A3** Cualquier usuario aprobado de AJDUT puede comprar en reventa (no necesita ser socio del proyecto).
- **A4** Las métricas que ve un socio están limitadas a `visibility = PUBLIC_TO_HOLDERS`.
- **B1** 2-3 admins operativos: la doble firma para stake institucional es invariante dura.
- **B3** KYC manual en v1.
- **Voz** "Manifestar interés" en lugar de "Comprar"; "Declarar distribución" en lugar de "Pagar dividendos"; "Confirmar recepción" en lugar de "Cobrar".

---

## Scripts

```bash
pnpm dev          # Dev server
pnpm build        # Build de producción
pnpm start        # Start producción
pnpm lint         # ESLint
pnpm typecheck    # tsc --noEmit
pnpm db:generate  # prisma generate
pnpm db:push      # Sync schema sin migración (dev)
pnpm db:migrate   # Crea y aplica migración
pnpm db:seed      # Carga datos de demo
pnpm db:studio    # Prisma Studio
pnpm db:reset     # Reset + seed
```
