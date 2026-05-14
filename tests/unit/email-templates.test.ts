import { describe, it, expect } from "vitest";
import { applicationApprovedEmail } from "@/lib/email/templates/application-approved";
import { applicationReceivedEmail } from "@/lib/email/templates/application-received";
import { applicationRejectedEmail } from "@/lib/email/templates/application-rejected";
import { interestReceivedConfirmationEmail } from "@/lib/email/templates/interest-received-confirmation";
import { newApplicationAdminEmail } from "@/lib/email/templates/new-application-admin";
import { newInterestToFounderEmail } from "@/lib/email/templates/new-interest-to-founder";
import { newProjectPendingAdminEmail } from "@/lib/email/templates/new-project-pending-admin";
import { passwordResetLinkEmail } from "@/lib/email/templates/password-reset-link";
import { projectApprovedFounderEmail } from "@/lib/email/templates/project-approved-founder";
import { projectRejectedFounderEmail } from "@/lib/email/templates/project-rejected-founder";
import { sharesAssignedInvestorEmail } from "@/lib/email/templates/shares-assigned-investor";
import { verificationCodeEmail } from "@/lib/email/templates/verification-code";

// Payload tóxico para chequear escape XSS. Si aparece intacto en el HTML del
// email, es un bug — todo input controlado por usuario debería pasar por escapeText.
const XSS = "<script>alert(1)</script>";

function assertEmail(out: { subject: string; html: string }) {
  expect(out.subject.length).toBeGreaterThan(0);
  expect(out.html).toMatch(/^<!doctype html>/i);
  expect(out.html).toContain("AJDUT");
}

function assertEscaped(html: string) {
  // El payload XSS literal NUNCA debe aparecer sin escapar en el HTML resultante.
  expect(html).not.toContain(XSS);
  // Debería aparecer escapado (forma esperada de escapeText)
  expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
}

describe("Templates de aplicación", () => {
  it("application-received: smoke + escape de fullName", () => {
    const out = applicationReceivedEmail({
      fullName: XSS,
      applicationId: "app-123",
    });
    assertEmail(out);
    assertEscaped(out.html);
    expect(out.html).toContain("app-123");
  });

  it("application-approved: smoke + setupUrl escapado en atributo", () => {
    const out = applicationApprovedEmail({
      fullName: "Ana",
      role: "PARTNER",
      setupUrl: 'https://ajdut.io/x?"=onerror=alert(1)',
      expiresAt: new Date(Date.now() + 72 * 3600 * 1000),
    });
    assertEmail(out);
    // La URL queda escapada (comilla doble → &quot;) en el atributo href
    expect(out.html).toContain("&quot;");
  });

  it("application-rejected: smoke + escape de rejectionNote", () => {
    const out = applicationRejectedEmail({
      fullName: "Bruno",
      rejectionNote: XSS,
    });
    assertEmail(out);
    assertEscaped(out.html);
  });
});

describe("Templates de interés", () => {
  it("new-interest-to-founder: smoke + escape de message, investorName, email", () => {
    const out = newInterestToFounderEmail({
      founderFirstName: XSS,
      projectName: "Pushka",
      investorName: XSS,
      investorEmail: "ana@socios.demo",
      sharesRequested: 100,
      amountFormatted: "USD 1,000",
      pricePerShareFormatted: "USD 10",
      message: XSS,
      leadsUrl: "https://ajdut.io/founder/pushka/leads",
    });
    assertEmail(out);
    assertEscaped(out.html);
    expect(out.html).toContain("100"); // shares request aparece
  });

  it("new-interest-to-founder: sin mensaje muestra el bloque alternativo", () => {
    const out = newInterestToFounderEmail({
      founderFirstName: "Ana",
      projectName: "Pushka",
      investorName: "Bruno",
      investorEmail: "bruno@socios.demo",
      sharesRequested: 50,
      amountFormatted: null,
      pricePerShareFormatted: null,
      message: "",
      leadsUrl: "https://ajdut.io",
    });
    assertEmail(out);
    expect(out.html.toLowerCase()).toContain("sin mensaje");
  });

  it("interest-received-confirmation: smoke", () => {
    const out = interestReceivedConfirmationEmail({
      investorFirstName: "Ana",
      projectName: XSS,
      founderName: "Bruno",
      sharesRequested: 100,
      amountFormatted: "USD 1,000",
      pricePerShareFormatted: "USD 10",
      projectUrl: "https://ajdut.io/proyectos/pushka",
    });
    assertEmail(out);
    assertEscaped(out.html);
  });
});

describe("Templates de admin", () => {
  it("new-application-admin: incluye datos del aplicante", () => {
    const out = newApplicationAdminEmail({
      applicationId: "app-1",
      fullName: "Ana",
      email: "ana@x.com",
      phone: "+52 55 1234 5678",
      country: "MX",
      motivation: XSS,
      referredBy: null,
      reviewUrl: "https://ajdut.io/admin/applications/app-1",
    });
    assertEmail(out);
    assertEscaped(out.html);
    expect(out.html).toContain("ana@x.com");
  });

  it("new-project-pending-admin: incluye founder + valoración", () => {
    const out = newProjectPendingAdminEmail({
      projectName: "Pushka",
      founderName: "Ana",
      founderEmail: "ana@founders.demo",
      sector: "Fintech",
      stage: "SEED",
      valuationFormatted: "USD 12,500,000",
      pricePerShareFormatted: "USD 10",
      totalSharesFormatted: "1,250,000",
      oneLiner: XSS,
      reviewUrl: "https://ajdut.io/proyectos/pushka",
    });
    assertEmail(out);
    assertEscaped(out.html);
    expect(out.html).toContain("12,500,000");
  });
});

describe("Templates de proyecto", () => {
  it("project-approved-founder: smoke + escape", () => {
    const out = projectApprovedFounderEmail({
      founderFirstName: XSS,
      projectName: "Pushka",
      projectUrl: "https://ajdut.io/founder/pushka",
    });
    assertEmail(out);
    assertEscaped(out.html);
  });

  it("project-rejected-founder: smoke + escape de razón", () => {
    const out = projectRejectedFounderEmail({
      founderFirstName: "Ana",
      projectName: "Pushka",
      reason: XSS,
    });
    assertEmail(out);
    assertEscaped(out.html);
  });
});

describe("Templates de cierre / seguridad", () => {
  it("shares-assigned-investor: smoke + escape", () => {
    const out = sharesAssignedInvestorEmail({
      investorFirstName: "Ana",
      projectName: XSS,
      shareCount: 1000,
      amountFormatted: "USD 10,000",
      pricePerShareFormatted: "USD 10",
      serial: "AJDUT-PUSHKA-XYZ",
      certificateSerial: "CERT-AJDUT-PUSHKA-XYZ",
      portfolioUrl: "https://ajdut.io/partner",
    });
    assertEmail(out);
    assertEscaped(out.html);
    expect(out.html).toContain("AJDUT-PUSHKA-XYZ");
  });

  it("password-reset-link: incluye TTL en horas", () => {
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1h
    const out = passwordResetLinkEmail({
      fullName: "Ana",
      resetUrl: "https://ajdut.io/establecer-contrasena/abc",
      expiresAt: expires,
    });
    assertEmail(out);
    expect(out.html).toMatch(/1 hora/i);
  });

  it("verification-code: incluye código 6 dígitos en subject y body", () => {
    const out = verificationCodeEmail({
      fullName: "Ana",
      code: "123456",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });
    assertEmail(out);
    expect(out.subject).toContain("123456");
    expect(out.html).toContain("123456");
  });

  it("verification-code: el nombre malicioso queda escapado", () => {
    const out = verificationCodeEmail({
      fullName: XSS,
      code: "654321",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });
    assertEscaped(out.html);
  });
});

describe("Invariantes globales de todos los templates", () => {
  it("ningún template incluye literal '${' (interpolaciones no resueltas)", () => {
    // Pequeño humo para evitar bugs tipo `subject = "${foo}"` (literal en template string crudo)
    const samples = [
      applicationReceivedEmail({ fullName: "x", applicationId: "y" }).html,
      applicationApprovedEmail({
        fullName: "x",
        role: "PARTNER",
        setupUrl: "u",
        expiresAt: new Date(),
      }).html,
      passwordResetLinkEmail({
        fullName: "x",
        resetUrl: "u",
        expiresAt: new Date(),
      }).html,
    ];
    for (const html of samples) {
      expect(html).not.toContain("${");
    }
  });
});
