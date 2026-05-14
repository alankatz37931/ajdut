import { describe, it, expect } from "vitest";
import { escapeText, escapeAttr, renderEmail } from "@/lib/email/layout";

describe("escapeText — defensa XSS en cuerpo de email", () => {
  it("escapa &", () => {
    expect(escapeText("Tom & Jerry")).toBe("Tom &amp; Jerry");
  });

  it("escapa <", () => {
    expect(escapeText("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;"
    );
  });

  it("escapa > pero NO comillas (es texto, no atributo)", () => {
    // En texto el navegador no interpreta comillas, así que no las escapamos.
    expect(escapeText('"texto" con \'comillas\'')).toBe('"texto" con \'comillas\'');
  });

  it("orden de escape: & primero (no doble-escape)", () => {
    // Si escapáramos & después de <, "&lt;" se transformaría a "&amp;lt;" (bug clásico).
    expect(escapeText("a < b & c")).toBe("a &lt; b &amp; c");
  });

  it("string vacío → vacío", () => {
    expect(escapeText("")).toBe("");
  });

  it("preserva caracteres unicode (acentos, ñ)", () => {
    expect(escapeText("Año del cóndor")).toBe("Año del cóndor");
  });
});

describe("escapeAttr — defensa XSS en atributos HTML", () => {
  it("escapa todo lo de escapeText + comillas dobles", () => {
    expect(escapeAttr('"onclick=alert(1)"')).toBe(
      "&quot;onclick=alert(1)&quot;"
    );
  });

  it("escapa < > & y \"", () => {
    expect(escapeAttr('<>&"')).toBe("&lt;&gt;&amp;&quot;");
  });
});

describe("renderEmail — armado del HTML completo", () => {
  it("incluye eyebrow, heading y body escapados", () => {
    const html = renderEmail({
      preview: "Preview text",
      eyebrow: "ETIQUETA",
      heading: "Hola mundo",
      bodyHtml: "<p>contenido seguro</p>",
    });
    expect(html).toContain("ETIQUETA");
    expect(html).toContain("Hola mundo");
    expect(html).toContain("<p>contenido seguro</p>");
  });

  it("eyebrow malicioso queda escapado (no rompe el HTML)", () => {
    const html = renderEmail({
      preview: "p",
      eyebrow: "<img src=x onerror=alert(1)>",
      heading: "h",
      bodyHtml: "<p>body</p>",
    });
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<img src=x");
  });

  it("CTA: el href se escapa con escapeAttr", () => {
    const html = renderEmail({
      preview: "p",
      eyebrow: "e",
      heading: "h",
      bodyHtml: "",
      ctaLabel: "Click",
      ctaUrl: 'https://x.com" onmouseover="alert(1)',
    });
    // La URL tiene una comilla doble — debería estar escapada en el atributo
    expect(html).toContain("&quot;");
    // No debería haber un atributo onmouseover crudo
    expect(html).not.toContain('" onmouseover="alert(1)"');
  });

  it("sin CTA, no renderiza el botón", () => {
    const html = renderEmail({
      preview: "p",
      eyebrow: "e",
      heading: "h",
      bodyHtml: "",
    });
    expect(html.toLowerCase()).not.toContain('href=');
  });

  it("preview también queda escapado (aparece en el hidden span del header)", () => {
    const html = renderEmail({
      preview: "<b>preview</b>",
      eyebrow: "e",
      heading: "h",
      bodyHtml: "",
    });
    expect(html).toContain("&lt;b&gt;preview&lt;/b&gt;");
  });

  it("incluye doctype y lang=es", () => {
    const html = renderEmail({
      preview: "p",
      eyebrow: "e",
      heading: "h",
      bodyHtml: "",
    });
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('<html lang="es">');
  });
});
