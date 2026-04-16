import { describe, it, expect } from "vitest";
import { executeSandboxed, type SandboxResult } from "../../src/sandbox/index.js";

// Minimal mock proxy for testing sandbox mechanics
const mockProxy = {
  workItems: {
    get: async (id: number) => ({ id, title: `Item ${id}`, state: "Active" }),
    getBatch: async (ids: number[]) => ids.map((id) => ({ id, title: `Item ${id}` })),
  },
  work: {
    listTeamIterations: async () => [
      { id: "iter-1", name: "Sprint 1", attributes: { timeFrame: "current" } },
    ],
  },
};

describe("executeSandboxed", () => {
  describe("basic execution", () => {
    it("should execute simple code and return result", async () => {
      const res = await executeSandboxed("result = 1 + 2", mockProxy);
      expect(res.success).toBe(true);
      expect(res.data).toBe(3);
    });

    it("should execute async code", async () => {
      const res = await executeSandboxed(
        "result = await ado.workItems.get(42)",
        mockProxy,
      );
      expect(res.success).toBe(true);
      expect(res.data).toEqual({ id: 42, title: "Item 42", state: "Active" });
    });

    it("should support multi-line code with multiple await calls", async () => {
      const code = `
        const iters = await ado.work.listTeamIterations();
        const item = await ado.workItems.get(1);
        result = { sprint: iters[0].name, item: item.title };
      `;
      const res = await executeSandboxed(code, mockProxy);
      expect(res.success).toBe(true);
      expect(res.data).toEqual({ sprint: "Sprint 1", item: "Item 1" });
    });

    it("should return undefined when no result is assigned", async () => {
      const res = await executeSandboxed("const x = 1", mockProxy);
      expect(res.success).toBe(true);
      expect(res.data).toBeUndefined();
    });
  });

  describe("console capture", () => {
    it("should capture console.log output", async () => {
      const res = await executeSandboxed(
        'console.log("hello"); result = "done"',
        mockProxy,
      );
      expect(res.success).toBe(true);
      expect(res.logs).toContain("hello");
    });
  });

  describe("error handling", () => {
    it("should return error for runtime exceptions", async () => {
      const res = await executeSandboxed("throw new Error('boom')", mockProxy);
      expect(res.success).toBe(false);
      expect(res.error).toContain("boom");
    });

    it("should reject banned patterns", async () => {
      const res = await executeSandboxed('require("fs")', mockProxy);
      expect(res.success).toBe(false);
      expect(res.error).toContain("require(");
    });
  });

  describe("timeout", () => {
    it("should timeout long-running code", async () => {
      const res = await executeSandboxed(
        "while(true) {}",
        mockProxy,
        { timeout: 500 },
      );
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/timeout|timed out/i);
    }, 10_000);
  });

  describe("globals", () => {
    it("should have JSON available", async () => {
      const res = await executeSandboxed(
        'result = JSON.stringify({ a: 1 })',
        mockProxy,
      );
      expect(res.success).toBe(true);
      expect(res.data).toBe('{"a":1}');
    });

    it("should have Math available", async () => {
      const res = await executeSandboxed(
        "result = Math.max(3, 7)",
        mockProxy,
      );
      expect(res.success).toBe(true);
      expect(res.data).toBe(7);
    });

    it("should have Date available", async () => {
      const res = await executeSandboxed(
        "result = typeof new Date().toISOString()",
        mockProxy,
      );
      expect(res.success).toBe(true);
      expect(res.data).toBe("string");
    });
  });
});
