import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createAuthHandler } from "../../src/auth.js";

describe("createAuthHandler", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.AZURE_DEVOPS_PAT;
    delete process.env.AZURE_DEVOPS_AUTH;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("PAT mode", () => {
    it("should create a PAT handler from explicit option", () => {
      const handler = createAuthHandler({ mode: "pat", pat: "my-token" });
      expect(handler.mode).toBe("pat");
    });

    it("should produce a Basic auth header with base64(:PAT)", async () => {
      const handler = createAuthHandler({ mode: "pat", pat: "my-token" });
      const header = await handler.getAuthorizationHeader();
      const expected = `Basic ${Buffer.from(":my-token").toString("base64")}`;
      expect(header).toBe(expected);
    });

    it("should read PAT from env var", () => {
      process.env.AZURE_DEVOPS_PAT = "env-token";
      const handler = createAuthHandler({ mode: "pat" });
      expect(handler.mode).toBe("pat");
    });

    it("should throw if PAT mode but no token", () => {
      expect(() => createAuthHandler({ mode: "pat" })).toThrow("AZURE_DEVOPS_PAT");
    });
  });

  describe("auto mode", () => {
    it("should resolve to PAT when AZURE_DEVOPS_PAT is set", () => {
      process.env.AZURE_DEVOPS_PAT = "auto-token";
      const handler = createAuthHandler();
      expect(handler.mode).toBe("pat");
    });

    it("should resolve to azcli when no PAT is set", () => {
      const handler = createAuthHandler();
      expect(handler.mode).toBe("azcli");
    });
  });

  describe("azcli mode", () => {
    it("should create an azcli handler", () => {
      const handler = createAuthHandler({ mode: "azcli" });
      expect(handler.mode).toBe("azcli");
    });
  });
});
