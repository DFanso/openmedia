import { describe, expect, it } from "vitest";
import { normalizeWebUrl } from "./url";

describe("normalizeWebUrl", () => {
  it("adds https to bare hosts", () => {
    expect(normalizeWebUrl("instagram.com")).toBe("https://instagram.com/");
    expect(normalizeWebUrl("  www.youtube.com/feed ")).toBe("https://www.youtube.com/feed");
  });

  it("keeps explicit http and https", () => {
    expect(normalizeWebUrl("http://example.com/a?b=1")).toBe("http://example.com/a?b=1");
    expect(normalizeWebUrl("HTTPS://Example.com")).toBe("https://example.com/");
  });

  it("treats host:port as a host, not a scheme", () => {
    expect(normalizeWebUrl("localhost:3000")).toBe("https://localhost:3000/");
  });

  it("rejects non-web schemes", () => {
    for (const input of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "data:text/html,hi",
      "ipc://localhost/x",
    ]) {
      expect(normalizeWebUrl(input)).toBeNull();
    }
  });

  it("rejects text that is not a host", () => {
    for (const input of ["", "   ", "not a url", "justoneword"]) {
      expect(normalizeWebUrl(input)).toBeNull();
    }
  });
});
