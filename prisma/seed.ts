/**
 * Seed de demostración para AJDUT.
 *
 * Crea:
 *  - Admin de bootstrap + Admin 2 (para doble firma cuando aplique)
 *  - Usuario institucional PLATFORM (bloqueado)
 *  - 5 socios partners
 *  - 4 founders + 4 proyectos diversos en estado ACTIVE, cada uno con:
 *    - Cap table inicial (10% PLATFORM, founders, socios, pool AVAILABLE)
 *    - OwnershipHistory con cadena de hashes válida
 *    - Métricas históricas
 *    - Hitos
 *  - 1 distribución de dividendos en IN_PAYOUT sobre Pushka
 *  - Aplicaciones pendientes de demo
 */
import {
  PrismaClient,
  Prisma,
  type ProjectStatus,
  type StartupStage,
  type ParticipationStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  PLATFORM_USER_EMAIL,
  PLATFORM_USER_NAME,
  PLATFORM_LOCKED_PASSWORD_HASH,
} from "../lib/constants/platform";
import { computeBlockHash } from "../lib/crypto/ownership-chain";

const prisma = new PrismaClient();

type FounderData = {
  fullName: string;
  role: string;
  equityPercent: number;
  joinedAt: Date;
};

type MilestoneData = {
  title: string;
  description: string;
  status: "PLANNED" | "IN_PROGRESS" | "ACHIEVED";
  targetDate?: Date;
  achievedAt?: Date;
};

type MetricEntry = {
  kind: "MRR" | "PAYING_CUSTOMERS" | "BURN_RATE" | "RUNWAY_MONTHS" | "ARR" | "ACTIVE_USERS" | "HEADCOUNT";
  baseValue: number;
  growthPerMonth: number;
  unit: string;
  visibility: "PUBLIC_TO_HOLDERS" | "PRIVATE";
};

type ProjectInitInput = {
  slug: string;
  name: string;
  legalName: string;
  jurisdiction: string;
  sector: string;
  oneLiner: string;
  problemStatement: string;
  solutionStatement: string;
  businessModel: string;
  description: string;
  stage: StartupStage;
  preMoneyValuation: number;
  valuationCurrency: string;
  websiteUrl?: string;
  totalShares: number;
  founderAllocations: Array<{ partnerIndex: number; shareCount: number; serial: string }>;
  availablePoolShares: number;
  approvedAt: Date;
  founders: FounderData[];
  milestones: MilestoneData[];
  metrics: MetricEntry[];
  metricsAnchorDate: Date;
};

async function createDemoProject(args: {
  input: ProjectInitInput;
  founderUser: { id: string; fullName: string };
  platformUserId: string;
  adminId: string;
  admin2Id: string;
  partners: Array<{ id: string; fullName: string }>;
}) {
  const { input, founderUser, platformUserId, adminId, admin2Id, partners } = args;

  console.log(`→ Creando proyecto ${input.name}…`);
  const project = await prisma.project.create({
    data: {
      slug: input.slug,
      name: input.name,
      kind: "STARTUP",
      status: "ACTIVE" as ProjectStatus,
      ownerId: founderUser.id,
      shortPitch: input.oneLiner,
      description: input.description,
      totalShares: input.totalShares,
      shareUnitLabel: "participación",
      approvedAt: input.approvedAt,
      approvedById: adminId,
    },
  });

  await prisma.startupProfile.create({
    data: {
      projectId: project.id,
      legalName: input.legalName,
      jurisdiction: input.jurisdiction,
      sector: input.sector,
      oneLiner: input.oneLiner,
      problemStatement: input.problemStatement,
      solutionStatement: input.solutionStatement,
      businessModel: input.businessModel,
      stage: input.stage,
      preMoneyValuation: new Prisma.Decimal(input.preMoneyValuation),
      valuationCurrency: input.valuationCurrency,
      totalEquityShares: input.totalShares,
      platformEquityPercent: new Prisma.Decimal(10),
      websiteUrl: input.websiteUrl ?? null,
      founders: { create: input.founders.map((f) => ({ ...f, equityPercent: new Prisma.Decimal(f.equityPercent), isActive: true })) },
      milestones: { create: input.milestones },
    },
  });

  await prisma.chatChannel.create({ data: { projectId: project.id } });

  // Cap table inicial
  const platformShares = Math.floor(input.totalShares * 0.1);
  const allocations: Array<{ ownerId: string; shareCount: number; isPlatform: boolean; serial: string }> = [
    {
      ownerId: platformUserId,
      shareCount: platformShares,
      isPlatform: true,
      serial: `AJDUT-${input.slug.toUpperCase()}-PLATFORM`,
    },
    ...input.founderAllocations.map((a) => ({
      ownerId: partners[a.partnerIndex]!.id,
      shareCount: a.shareCount,
      isPlatform: false,
      serial: a.serial,
    })),
  ];

  let prevHash: string | null = null;
  const effectiveAt = input.approvedAt;

  for (const alloc of allocations) {
    const participation = await prisma.participation.create({
      data: {
        projectId: project.id,
        serialCode: alloc.serial,
        shareCount: alloc.shareCount,
        status: "ASSIGNED" as ParticipationStatus,
        currentOwnerId: alloc.ownerId,
        isPlatformStake: alloc.isPlatform,
        acquiredAt: effectiveAt,
      },
    });

    const payload = {
      participationId: participation.id,
      fromUserId: null,
      toUserId: alloc.ownerId,
      authorizedById: adminId,
      coAuthorizedById: alloc.isPlatform ? admin2Id : null,
      reason: alloc.isPlatform
        ? `Platform equity stake: 10% auto-emisión al activar ${input.name}.`
        : "Asignación inicial al socio.",
      resaleListingId: null,
      effectiveAt: effectiveAt.toISOString(),
    };
    const blockHash = computeBlockHash(payload, prevHash);
    await prisma.ownershipHistory.create({
      data: {
        participationId: participation.id,
        fromUserId: null,
        toUserId: alloc.ownerId,
        authorizedById: adminId,
        coAuthorizedById: alloc.isPlatform ? admin2Id : null,
        reason: payload.reason,
        effectiveAt,
        blockHash,
        prevHash,
      },
    });
    prevHash = blockHash;
  }

  // Pool de acciones disponibles
  if (input.availablePoolShares > 0) {
    await prisma.participation.create({
      data: {
        projectId: project.id,
        serialCode: `AJDUT-${input.slug.toUpperCase()}-POOL`,
        shareCount: input.availablePoolShares,
        status: "AVAILABLE" as ParticipationStatus,
        isPlatformStake: false,
      },
    });
  }

  // Métricas históricas
  const profile = await prisma.startupProfile.findUniqueOrThrow({ where: { projectId: project.id } });
  const months = 6;
  for (let i = 0; i < months; i++) {
    const asOf = new Date(input.metricsAnchorDate);
    asOf.setMonth(asOf.getMonth() - (months - 1 - i));
    for (const m of input.metrics) {
      const value = m.baseValue + i * m.growthPerMonth;
      await prisma.startupMetric.create({
        data: {
          startupProfileId: profile.id,
          kind: m.kind,
          value: new Prisma.Decimal(value),
          unit: m.unit,
          asOf,
          reportedById: founderUser.id,
          visibility: m.visibility,
        },
      });
    }
  }

  return { project, profile };
}

async function main() {
  console.log("→ Limpiando datos previos…");
  await prisma.$transaction([
    prisma.dividendPayment.deleteMany(),
    prisma.dividendDistribution.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.message.deleteMany(),
    prisma.chatChannel.deleteMany(),
    prisma.certificate.deleteMany(),
    prisma.ownershipHistory.deleteMany(),
    prisma.resaleListing.deleteMany(),
    prisma.lead.deleteMany(),
    prisma.participation.deleteMany(),
    prisma.startupMetric.deleteMany(),
    prisma.milestone.deleteMany(),
    prisma.fundingRound.deleteMany(),
    prisma.founder.deleteMany(),
    prisma.startupProfile.deleteMany(),
    prisma.projectCoAdmin.deleteMany(),
    prisma.report.deleteMany(),
    prisma.passwordSetupToken.deleteMany(),
    prisma.project.deleteMany(),
    prisma.platformPayoutAccount.deleteMany(),
    prisma.user.deleteMany(),
    prisma.application.deleteMany(),
  ]);

  // ─── Usuarios institucionales ───────────────────────────────────
  const platformUser = await prisma.user.create({
    data: {
      email: PLATFORM_USER_EMAIL,
      fullName: PLATFORM_USER_NAME,
      role: "PLATFORM",
      passwordHash: PLATFORM_LOCKED_PASSWORD_HASH,
      isActive: true,
    },
  });

  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL ?? "admin@ajdut.io";
  const adminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "cambia-esto-tras-primer-login";
  const adminName = process.env.BOOTSTRAP_ADMIN_NAME ?? "Admin AJDUT";
  const admin = await prisma.user.create({
    data: {
      email: adminEmail.toLowerCase(),
      fullName: adminName,
      role: "ADMIN",
      passwordHash: await bcrypt.hash(adminPassword, 12),
      isActive: true,
    },
  });
  const admin2 = await prisma.user.create({
    data: {
      email: "admin2@ajdut.io",
      fullName: "Admin AJDUT (Co-firma)",
      role: "ADMIN",
      passwordHash: await bcrypt.hash(adminPassword, 12),
      isActive: true,
    },
  });

  // ─── Founders (cada uno dueño de un proyecto) ──────────────────
  const founderPass = await bcrypt.hash("ajdut-demo-2026", 12);
  const luciaFounder = await prisma.user.create({
    data: { email: "lucia@pushka.demo", fullName: "Lucía Méndez", role: "PROJECT_OWNER", passwordHash: founderPass, isActive: true },
  });
  const tomasFounder = await prisma.user.create({
    data: { email: "tomas@terraverde.demo", fullName: "Tomás Vergara", role: "PROJECT_OWNER", passwordHash: founderPass, isActive: true },
  });
  const sofiaFounder = await prisma.user.create({
    data: { email: "sofia@lupasalud.demo", fullName: "Sofía Cortés", role: "PROJECT_OWNER", passwordHash: founderPass, isActive: true },
  });
  const matiasFounder = await prisma.user.create({
    data: { email: "matias@mercurio.demo", fullName: "Matías Iglesias", role: "PROJECT_OWNER", passwordHash: founderPass, isActive: true },
  });

  // ─── Socios ────────────────────────────────────────────────────
  const partnerPass = await bcrypt.hash("ajdut-demo-2026", 12);
  const partners = await Promise.all([
    prisma.user.create({ data: { email: "ana@socios.demo", fullName: "Ana Pérez", role: "PARTNER", passwordHash: partnerPass, isActive: true } }),
    prisma.user.create({ data: { email: "diego@socios.demo", fullName: "Diego Soto", role: "PARTNER", passwordHash: partnerPass, isActive: true } }),
    prisma.user.create({ data: { email: "mariana@socios.demo", fullName: "Mariana López", role: "PARTNER", passwordHash: partnerPass, isActive: true } }),
    prisma.user.create({ data: { email: "carlos@socios.demo", fullName: "Carlos Reyes", role: "PARTNER", passwordHash: partnerPass, isActive: true } }),
    prisma.user.create({ data: { email: "valeria@socios.demo", fullName: "Valeria Núñez", role: "PARTNER", passwordHash: partnerPass, isActive: true } }),
  ]);

  // ─── PROYECTO 1: Pushka SAS (Fintech · Seed) ────────────────────
  const pushka = await createDemoProject({
    founderUser: luciaFounder,
    platformUserId: platformUser.id,
    adminId: admin.id,
    admin2Id: admin2.id,
    partners,
    input: {
      slug: "pushka",
      name: "Pushka SAS",
      legalName: "Pushka Servicios SAS",
      jurisdiction: "MX-CDMX",
      sector: "Fintech · SaaS B2B",
      oneLiner: "Plataforma de pagos para pymes en LATAM",
      problemStatement:
        "Las pymes en LATAM tardan semanas en habilitar pagos digitales por falta de onboarding bancario simple.",
      solutionStatement:
        "Onboarding bancario en 48 horas con compliance integrado, conectado a procesadores locales.",
      businessModel: "SaaS mensual + fee por transacción procesada (2.9% + 0.30 USD).",
      description:
        "Pushka conecta pymes con rieles de pago modernos en LATAM, eliminando fricciones del onboarding bancario tradicional.",
      stage: "SEED",
      preMoneyValuation: 12_500_000,
      valuationCurrency: "USD",
      websiteUrl: "https://pushka.demo",
      // $12.5M / $10 por acción = 1,250,000 acciones totales
      totalShares: 1_250_000,
      founderAllocations: [
        { partnerIndex: 0, shareCount: 50_000, serial: "AJDUT-PUSHKA-0001" },
        { partnerIndex: 1, shareCount: 30_000, serial: "AJDUT-PUSHKA-0002" },
        { partnerIndex: 2, shareCount: 40_000, serial: "AJDUT-PUSHKA-0003" },
        { partnerIndex: 3, shareCount: 50_000, serial: "AJDUT-PUSHKA-0004" },
        { partnerIndex: 4, shareCount: 30_000, serial: "AJDUT-PUSHKA-0005" },
      ],
      // 1,250,000 - 125,000 (platform 10%) - 200,000 (socios) = 925,000
      availablePoolShares: 925_000,
      approvedAt: new Date("2026-03-12T12:00:00Z"),
      founders: [
        { fullName: "Lucía Méndez", role: "CEO", equityPercent: 22, joinedAt: new Date("2024-01-15") },
        { fullName: "Carlos Reyes", role: "CTO", equityPercent: 18, joinedAt: new Date("2024-01-15") },
        { fullName: "Diego Soto", role: "COO", equityPercent: 10, joinedAt: new Date("2024-04-10") },
        { fullName: "Mariana López", role: "CMO", equityPercent: 2, joinedAt: new Date("2025-02-01") },
      ],
      milestones: [
        { title: "Cierre ronda Seed 2M USD", description: "Cerrada con 3 inversores institucionales.", status: "ACHIEVED", achievedAt: new Date("2026-09-02") },
        { title: "Lanzamiento en México", description: "Salida pública del producto.", status: "ACHIEVED", achievedAt: new Date("2026-06-15") },
        { title: "Expansión a Colombia", description: "Equipo local + alianza bancaria.", status: "IN_PROGRESS", targetDate: new Date("2026-08-30") },
        { title: "Series A pre-cierre", description: "Lead identificado.", status: "PLANNED", targetDate: new Date("2026-12-15") },
      ],
      metrics: [
        { kind: "MRR", baseValue: 30000, growthPerMonth: 2050, unit: "USD", visibility: "PUBLIC_TO_HOLDERS" },
        { kind: "PAYING_CUSTOMERS", baseValue: 95, growthPerMonth: 8, unit: "customers", visibility: "PUBLIC_TO_HOLDERS" },
        { kind: "BURN_RATE", baseValue: 36000, growthPerMonth: 500, unit: "USD", visibility: "PRIVATE" },
        { kind: "RUNWAY_MONTHS", baseValue: 14, growthPerMonth: -1, unit: "meses", visibility: "PRIVATE" },
      ],
      metricsAnchorDate: new Date("2026-11-01"),
    },
  });

  // ─── PROYECTO 2: TerraVerde (AgriTech · Pre-seed) ──────────────
  await createDemoProject({
    founderUser: tomasFounder,
    platformUserId: platformUser.id,
    adminId: admin.id,
    admin2Id: admin2.id,
    partners,
    input: {
      slug: "terraverde",
      name: "TerraVerde",
      legalName: "TerraVerde SpA",
      jurisdiction: "AR-CABA",
      sector: "AgriTech · IoT",
      oneLiner: "Riego inteligente para pequeños productores agrícolas",
      problemStatement:
        "El 80% de los productores familiares en LATAM riegan por intuición y gastan hasta 40% más agua de lo necesario, perdiendo cosechas en años secos.",
      solutionStatement:
        "Sensores IoT de bajo costo + algoritmo de predicción climática local que dispara riego solo cuando hace falta. Instalación en 2 horas, sin obra.",
      businessModel: "Hardware bundle único + suscripción mensual SaaS por hectárea monitoreada.",
      description:
        "Diseñamos un kit de 4 sensores (humedad, temperatura, viento, lluvia) que se comunica vía LoRaWAN. El campo deja de regar a ojo y empieza a regar con datos. Trabajamos con cooperativas de Mendoza, Salta y Río Negro.",
      stage: "PRE_SEED",
      preMoneyValuation: 1_800_000,
      valuationCurrency: "USD",
      websiteUrl: "https://terraverde.demo",
      // $1.8M / $10 = 180,000 acciones totales
      totalShares: 180_000,
      founderAllocations: [
        { partnerIndex: 0, shareCount: 10_000, serial: "AJDUT-TERRAVERDE-0001" },
        { partnerIndex: 2, shareCount: 8_000, serial: "AJDUT-TERRAVERDE-0002" },
      ],
      // 180,000 - 18,000 (platform) - 18,000 (socios) = 144,000
      availablePoolShares: 144_000,
      approvedAt: new Date("2026-04-22T10:00:00Z"),
      founders: [
        { fullName: "Tomás Vergara", role: "CEO", equityPercent: 35, joinedAt: new Date("2025-06-01") },
        { fullName: "Florencia Quiroga", role: "CTO", equityPercent: 25, joinedAt: new Date("2025-06-01") },
        { fullName: "Joaquín Pereyra", role: "Head of Field Ops", equityPercent: 8, joinedAt: new Date("2025-09-15") },
      ],
      milestones: [
        { title: "MVP del kit de 4 sensores", description: "Versión funcional probada en 3 fincas piloto.", status: "ACHIEVED", achievedAt: new Date("2026-02-10") },
        { title: "Primeras 50 cooperativas onboarded", description: "Mendoza + Río Negro.", status: "ACHIEVED", achievedAt: new Date("2026-09-20") },
        { title: "Certificación INTA Argentina", description: "Validación oficial del algoritmo.", status: "IN_PROGRESS", targetDate: new Date("2027-02-01") },
        { title: "Expansión a Chile", description: "Apertura de oficina en Mendoza con foco trasandino.", status: "PLANNED", targetDate: new Date("2027-04-01") },
      ],
      metrics: [
        { kind: "ACTIVE_USERS", baseValue: 20, growthPerMonth: 12, unit: "cooperativas", visibility: "PUBLIC_TO_HOLDERS" },
        { kind: "MRR", baseValue: 3500, growthPerMonth: 850, unit: "USD", visibility: "PUBLIC_TO_HOLDERS" },
        { kind: "HEADCOUNT", baseValue: 6, growthPerMonth: 1, unit: "personas", visibility: "PUBLIC_TO_HOLDERS" },
        { kind: "RUNWAY_MONTHS", baseValue: 11, growthPerMonth: -1, unit: "meses", visibility: "PRIVATE" },
      ],
      metricsAnchorDate: new Date("2026-11-01"),
    },
  });

  // ─── PROYECTO 3: Lupa Salud (HealthTech · Seed) ────────────────
  await createDemoProject({
    founderUser: sofiaFounder,
    platformUserId: platformUser.id,
    adminId: admin.id,
    admin2Id: admin2.id,
    partners,
    input: {
      slug: "lupa-salud",
      name: "Lupa Salud",
      legalName: "Lupa Salud Telemedicina SAS",
      jurisdiction: "CO-Bogotá",
      sector: "HealthTech · Telemedicina",
      oneLiner: "Acceso a especialistas para zonas rurales de LATAM",
      problemStatement:
        "En zonas rurales de Colombia, Perú y Ecuador hay 1 especialista cada 15.000 personas. La gente viaja 8+ horas para una consulta cardiológica o dermatológica.",
      solutionStatement:
        "Red de centros comunitarios equipados con kit de teleconsulta (HD cam + estetoscopio digital + dermatoscopio) atendidos por enfermeras locales, conectados a especialistas urbanos.",
      businessModel: "Convenios con prestadoras de salud públicas y EPS privadas. Cobro por consulta resuelta.",
      description:
        "Hoy operamos 18 centros en Boyacá, Nariño y Cauca. Atendimos 12.000 consultas en 2026 con tiempos de respuesta de 36 horas promedio, contra los 4 meses del sistema público tradicional.",
      stage: "SEED",
      preMoneyValuation: 6_200_000,
      valuationCurrency: "USD",
      websiteUrl: "https://lupasalud.demo",
      // $6.2M / $10 = 620,000 acciones totales
      totalShares: 620_000,
      founderAllocations: [
        { partnerIndex: 1, shareCount: 25_000, serial: "AJDUT-LUPA-0001" },
        { partnerIndex: 3, shareCount: 20_000, serial: "AJDUT-LUPA-0002" },
        { partnerIndex: 4, shareCount: 15_000, serial: "AJDUT-LUPA-0003" },
      ],
      // 620,000 - 62,000 (platform) - 60,000 (socios) = 498,000
      availablePoolShares: 498_000,
      approvedAt: new Date("2026-05-30T14:00:00Z"),
      founders: [
        { fullName: "Sofía Cortés", role: "CEO + Médica", equityPercent: 32, joinedAt: new Date("2024-08-01") },
        { fullName: "Andrés Marín", role: "CTO", equityPercent: 22, joinedAt: new Date("2024-08-01") },
        { fullName: "Camila Ospina", role: "Head of Clinical Operations", equityPercent: 12, joinedAt: new Date("2025-03-12") },
      ],
      milestones: [
        { title: "18 centros operando", description: "Boyacá, Nariño, Cauca.", status: "ACHIEVED", achievedAt: new Date("2026-08-01") },
        { title: "12k consultas resueltas en 2026", description: "Tiempo promedio 36h.", status: "ACHIEVED", achievedAt: new Date("2026-11-15") },
        { title: "Convenio con MinSalud Colombia", description: "Piloto en Putumayo.", status: "IN_PROGRESS", targetDate: new Date("2027-03-01") },
        { title: "Expansión a Perú", description: "Apertura de 6 centros en sierra peruana.", status: "PLANNED", targetDate: new Date("2027-07-01") },
      ],
      metrics: [
        { kind: "ACTIVE_USERS", baseValue: 6500, growthPerMonth: 920, unit: "pacientes", visibility: "PUBLIC_TO_HOLDERS" },
        { kind: "MRR", baseValue: 28000, growthPerMonth: 4200, unit: "USD", visibility: "PUBLIC_TO_HOLDERS" },
        { kind: "HEADCOUNT", baseValue: 22, growthPerMonth: 3, unit: "personas", visibility: "PUBLIC_TO_HOLDERS" },
        { kind: "BURN_RATE", baseValue: 48000, growthPerMonth: 1500, unit: "USD", visibility: "PRIVATE" },
        { kind: "RUNWAY_MONTHS", baseValue: 16, growthPerMonth: -1, unit: "meses", visibility: "PRIVATE" },
      ],
      metricsAnchorDate: new Date("2026-11-01"),
    },
  });

  // ─── PROYECTO 4: Mercurio Studios (Gaming · Early Revenue) ──────
  await createDemoProject({
    founderUser: matiasFounder,
    platformUserId: platformUser.id,
    adminId: admin.id,
    admin2Id: admin2.id,
    partners,
    input: {
      slug: "mercurio-studios",
      name: "Mercurio Studios",
      legalName: "Mercurio Interactive S.A.",
      jurisdiction: "UY-Montevideo",
      sector: "Gaming · Mobile",
      oneLiner: "Estudio de juegos móviles competitivos para LATAM",
      problemStatement:
        "Los juegos móviles del top 100 están dominados por estudios asiáticos con monetización agresiva. No hay producto pensado para el jugador competitivo latino que valora skill sobre paga.",
      solutionStatement:
        "Diseñamos juegos PvP rápidos (3-5 min/match) con economía sin pay-to-win. Monetización por cosméticos + battle pass. Localización agresiva en español rioplatense, mexicano y caribe.",
      businessModel: "Microtransacciones cosméticas + battle pass mensual + suscripción premium (sin ventaja en gameplay).",
      description:
        "Lanzamos 'Combate Andino' en febrero 2026. 280k descargas en 3 meses, retention D30 del 22%. Trabajamos en el segundo título: 'Tango Royale', planeado para Q3 2027.",
      stage: "EARLY_REVENUE",
      preMoneyValuation: 4_400_000,
      valuationCurrency: "USD",
      websiteUrl: "https://mercurio.demo",
      // $4.4M / $10 = 440,000 acciones totales
      totalShares: 440_000,
      founderAllocations: [
        { partnerIndex: 0, shareCount: 18_000, serial: "AJDUT-MERCURIO-0001" },
        { partnerIndex: 2, shareCount: 12_000, serial: "AJDUT-MERCURIO-0002" },
      ],
      // 440,000 - 44,000 (platform) - 30,000 (socios) = 366,000
      availablePoolShares: 366_000,
      approvedAt: new Date("2026-07-10T11:30:00Z"),
      founders: [
        { fullName: "Matías Iglesias", role: "CEO + Game Director", equityPercent: 30, joinedAt: new Date("2025-01-20") },
        { fullName: "Pilar Fernández", role: "CTO", equityPercent: 22, joinedAt: new Date("2025-01-20") },
        { fullName: "Ramiro Bertolotti", role: "Art Director", equityPercent: 10, joinedAt: new Date("2025-05-01") },
      ],
      milestones: [
        { title: "'Combate Andino' lanzado", description: "iOS + Android en LATAM.", status: "ACHIEVED", achievedAt: new Date("2026-02-14") },
        { title: "250k descargas alcanzadas", description: "Sin campaña pagada significativa, ASO + creators.", status: "ACHIEVED", achievedAt: new Date("2026-05-20") },
        { title: "Primer torneo oficial", description: "Premio 10k USD, finalistas de 8 países.", status: "ACHIEVED", achievedAt: new Date("2026-10-05") },
        { title: "Lanzamiento de 'Tango Royale'", description: "Battle royale ambientado en LATAM.", status: "PLANNED", targetDate: new Date("2027-09-01") },
      ],
      metrics: [
        { kind: "ACTIVE_USERS", baseValue: 45000, growthPerMonth: 8500, unit: "DAU", visibility: "PUBLIC_TO_HOLDERS" },
        { kind: "MRR", baseValue: 18000, growthPerMonth: 3100, unit: "USD", visibility: "PUBLIC_TO_HOLDERS" },
        { kind: "HEADCOUNT", baseValue: 12, growthPerMonth: 1, unit: "personas", visibility: "PUBLIC_TO_HOLDERS" },
        { kind: "BURN_RATE", baseValue: 32000, growthPerMonth: 800, unit: "USD", visibility: "PRIVATE" },
      ],
      metricsAnchorDate: new Date("2026-11-01"),
    },
  });

  // ─── Distribución de dividendos sobre Pushka ────────────────────
  console.log("→ Creando distribución de dividendos Q3 2026 sobre Pushka…");
  const totalAmount = new Prisma.Decimal(180_000);
  const totalSharesAtRecord = 1_250_000;
  const amountPerShare = totalAmount.div(totalSharesAtRecord);

  const distribution = await prisma.dividendDistribution.create({
    data: {
      projectId: pushka.project.id,
      declaredById: luciaFounder.id,
      title: "Distribución Q3 2026",
      fiscalPeriod: "Q3-2026",
      notes: "Distribución correspondiente al Q3 conforme acuerdo de socios.",
      totalAmount,
      currency: "USD",
      recordDate: new Date("2026-09-30"),
      totalSharesAtRecord,
      amountPerShare,
      disclaimerHash: "demo-disclaimer-v1",
      status: "IN_PAYOUT",
      announcedAt: new Date("2026-10-05"),
      payoutStartedAt: new Date("2026-10-06"),
    },
  });

  const holders = await prisma.participation.findMany({
    where: { projectId: pushka.project.id, currentOwnerId: { not: null } },
    select: { id: true, currentOwnerId: true, shareCount: true, isPlatformStake: true },
  });

  let distributed = new Prisma.Decimal(0);
  const payments: Array<{ participationId: string; recipientId: string; shareCount: number; amount: Prisma.Decimal; isPlatformPayment: boolean }> = [];
  for (const h of holders) {
    if (!h.currentOwnerId) continue;
    const amount = amountPerShare.mul(h.shareCount).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
    distributed = distributed.plus(amount);
    payments.push({
      participationId: h.id,
      recipientId: h.currentOwnerId,
      shareCount: h.shareCount,
      amount,
      isPlatformPayment: h.isPlatformStake,
    });
  }

  const residual = totalAmount.minus(distributed);
  const platformPayment = payments.find((p) => p.isPlatformPayment);
  if (platformPayment) platformPayment.amount = platformPayment.amount.plus(residual);

  for (let i = 0; i < payments.length; i++) {
    const p = payments[i]!;
    const status: "PENDING" | "SENT" | "RECEIVED" = i < 2 ? "RECEIVED" : i < 4 ? "SENT" : "PENDING";
    await prisma.dividendPayment.create({
      data: {
        distributionId: distribution.id,
        participationId: p.participationId,
        recipientId: p.recipientId,
        shareCount: p.shareCount,
        amount: p.amount,
        currency: "USD",
        isPlatformPayment: p.isPlatformPayment,
        status,
        sentAt: status !== "PENDING" ? new Date("2026-10-08") : null,
        sentChannel: status !== "PENDING" ? "SPEI" : null,
        sentReference: status !== "PENDING" ? `REF-${i + 1000}` : null,
        receivedAt: status === "RECEIVED" ? new Date("2026-10-10") : null,
        receivedNote: status === "RECEIVED" ? "Confirmado." : null,
        confirmedById: status === "RECEIVED" ? p.recipientId : null,
      },
    });
  }

  // ─── Aplicaciones de demo pendientes ───────────────────────────
  await prisma.application.createMany({
    data: [
      {
        fullName: "Sebastián Ríos",
        email: "sebastian.demo@example.com",
        phone: "+52 55 1234 5678",
        country: "México",
        motivation: "Tengo experiencia invirtiendo en startups latam y busco una comunidad cerrada con trazabilidad real.",
      },
      {
        fullName: "Renata Cárdenas",
        email: "renata.demo@example.com",
        phone: "+57 301 234 5678",
        country: "Colombia",
        motivation: "Soy advisor de varias fintechs colombianas y AJDUT me parece la herramienta adecuada para formalizar mis posiciones.",
      },
    ],
  });

  console.log("\n✓ Seed completado.\n");
  console.log("Credenciales de prueba:");
  console.log(`  Admin:     ${admin.email} / ${adminPassword}`);
  console.log(`  Admin 2:   ${admin2.email} / ${adminPassword}`);
  console.log(`  Founders:  lucia@pushka.demo, tomas@terraverde.demo, sofia@lupasalud.demo, matias@mercurio.demo / ajdut-demo-2026`);
  console.log(`  Socios:    ${partners.map((p) => p.email).join(", ")} / ajdut-demo-2026`);
  console.log("");
  console.log("Proyectos creados:");
  console.log("  · Pushka SAS (Fintech, Seed) — Lucía Méndez");
  console.log("  · TerraVerde (AgriTech, Pre-seed) — Tomás Vergara");
  console.log("  · Lupa Salud (HealthTech, Seed) — Sofía Cortés");
  console.log("  · Mercurio Studios (Gaming, Early Revenue) — Matías Iglesias");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
