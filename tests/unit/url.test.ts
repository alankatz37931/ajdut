import { describe, it, expect } from "vitest";
import { normalizeOptionalUrl, normalizeRequiredUrl } from "@/lib/utils/url";
import { ValidationError } from "@/lib/services/errors";

describe("normalizeOptionalUrl", () => {
  it("string vacío → null", () => {
    expect(normalizeOptionalUrl("")).toBeNull();
  });

  it("solo whitespace → null", () => {
    expect(normalizeOptionalUrl("   ")).toBeNull();
    expect(normalizeOptionalUrl("\t\n  ")).toBeNull();
  });

  it("null/undefined → null", () => {
    expect(normalizeOptionalUrl(null)).toBeNull();
    expect(normalizeOptionalUrl(undefined)).toBeNull();
  });

  it("https URL válida → la devuelve igual", () => {
    expect(normalizeOptionalUrl("https://foo.com")).toBe("https://foo.com");
  });

  it("URL con whitespace alrededor → trimmed", () => {
    expect(normalizeOptionalUrl("  https://foo.com  ")).toBe("https://foo.com");
  });

  it("http (sin s) → permitido", () => {
    expect(normalizeOptionalUrl("http://foo.com")).toBe("http://foo.com");
  });

  it("URL con path y query strings → la devuelve igual", () => {
    expect(normalizeOptionalUrl("https://foo.com/path?x=1&y=2")).toBe(
      "https://foo.com/path?x=1&y=2"
    );
  });

  it("javascript: scheme → 'INVALID' (XSS guard)", () => {
    expect(normalizeOptionalUrl("javascript:alert(1)")).toBe("INVALID");
  });

  it("data: scheme → 'INVALID' (XSS guard)", () => {
    expect(normalizeOptionalUrl("data:text/html,<script>alert(1)</script>")).toBe(
      "INVALID"
    );
  });

  it("vbscript: scheme → 'INVALID'", () => {
    expect(normalizeOptionalUrl("vbscript:msgbox(1)")).toBe("INVALID");
  });

  it("ftp:// → 'INVALID' (solo http/https)", () => {
    expect(normalizeOptionalUrl("ftp://foo.com")).toBe("INVALID");
  });

  it("string sin protocolo → 'INVALID'", () => {
    expect(normalizeOptionalUrl("foo.com")).toBe("INVALID");
  });

  it("URL malformada → 'INVALID'", () => {
    expect(normalizeOptionalUrl("not a url at all")).toBe("INVALID");
  });

  it("URL de 2049 chars → 'INVALID' (cap)", () => {
    const longUrl = "https://foo.com/" + "a".repeat(2049 - "https://foo.com/".length);
    expect(longUrl.length).toBe(2049);
    expect(normalizeOptionalUrl(longUrl)).toBe("INVALID");
  });

  it("URL de exactamente 2048 chars → válida (límite inclusivo)", () => {
    const url = "https://foo.com/" + "a".repeat(2048 - "https://foo.com/".length);
    expect(url.length).toBe(2048);
    expect(normalizeOptionalUrl(url)).toBe(url);
  });

  it("acepta unknown coercible a string", () => {
    // El normalizador llama String(raw); un número se coerciona pero falla al ser URL.
    expect(normalizeOptionalUrl(123)).toBe("INVALID");
  });
});

describe("normalizeRequiredUrl", () => {
  it("URL válida → devuelve la URL trimmed", () => {
    expect(normalizeRequiredUrl("https://foo.com", "website")).toBe(
      "https://foo.com"
    );
    expect(normalizeRequiredUrl("  https://foo.com  ", "website")).toBe(
      "https://foo.com"
    );
  });

  it("string vacío → lanza ValidationError con el field", () => {
    expect(() => normalizeRequiredUrl("", "website")).toThrow(ValidationError);
    try {
      normalizeRequiredUrl("", "website");
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).details).toEqual({ field: "website" });
      expect((e as ValidationError).code).toBe("VALIDATION");
    }
  });

  it("javascript: scheme → lanza ValidationError", () => {
    expect(() =>
      normalizeRequiredUrl("javascript:alert(1)", "homepage")
    ).toThrow(ValidationError);
    try {
      normalizeRequiredUrl("javascript:alert(1)", "homepage");
    } catch (e) {
      expect((e as ValidationError).details).toEqual({ field: "homepage" });
    }
  });

  it("ftp:// → lanza ValidationError", () => {
    expect(() => normalizeRequiredUrl("ftp://foo.com", "url")).toThrow(
      ValidationError
    );
  });

  it("null → lanza ValidationError", () => {
    expect(() => normalizeRequiredUrl(null, "url")).toThrow(ValidationError);
  });

  it("undefined → lanza ValidationError", () => {
    expect(() => normalizeRequiredUrl(undefined, "url")).toThrow(ValidationError);
  });

  it("string sin protocolo → lanza ValidationError", () => {
    expect(() => normalizeRequiredUrl("foo.com", "url")).toThrow(ValidationError);
  });

  it("URL de 2049 chars → lanza ValidationError", () => {
    const longUrl = "https://foo.com/" + "a".repeat(2050);
    expect(() => normalizeRequiredUrl(longUrl, "url")).toThrow(ValidationError);
  });

  it("el mensaje del error incluye 'URL invalida'", () => {
    try {
      normalizeRequiredUrl("", "x");
    } catch (e) {
      expect((e as Error).message).toContain("URL invalida");
    }
  });
});
