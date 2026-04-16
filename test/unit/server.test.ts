import { describe, it, expect } from "vitest";
import { Catalog } from "../../src/catalog/index.js";
import { Domain } from "../../src/catalog/types.js";
import type { CatalogEntry } from "../../src/catalog/types.js";
import { createServer } from "../../src/server.js";

const FIXTURES: CatalogEntry[] = [
  {
    id: "work-items.get", domain: Domain.WorkItems, name: "get",
    title: "Get Work Item", description: "Fetch a single work item by ID.",
    params: [{ name: "id", type: "number", required: true, description: "Work item ID" }],
    returns: "WorkItem", example: "await ado.workItems.get(123)",
    tags: ["work item"], readOnly: true,
  },
];

describe("createServer", () => {
  it("should create a server with name ado-code-mode-mcp", () => {
    const catalog = new Catalog(FIXTURES);
    const server = createServer({ catalog, proxyFactory: () => ({}) });
    expect(server).toBeDefined();
  });

  it("should register the server without errors", () => {
    const catalog = new Catalog(FIXTURES);
    expect(() => createServer({ catalog, proxyFactory: () => ({}) })).not.toThrow();
  });
});

describe("catalog integration", () => {
  it("should support full catalog with all domains", async () => {
    const { allEntries } = await import("../../src/catalog/all.js");
    const catalog = new Catalog(allEntries);
    expect(catalog.size).toBeGreaterThan(70);

    // Verify all domains have entries
    for (const domain of Object.values(Domain)) {
      const entries = catalog.listByDomain(domain);
      expect(entries.length, `${domain} should have entries`).toBeGreaterThan(0);
    }
  });

  it("should find sprint-related operations across all entries", async () => {
    const { allEntries } = await import("../../src/catalog/all.js");
    const catalog = new Catalog(allEntries);
    const results = catalog.search("sprint iteration", { limit: 15 });
    expect(results.length).toBeGreaterThan(0);
    const ids = results.map((r) => r.entry.id);
    expect(ids).toContain("work.listTeamIterations");
  });

  it("should find pipeline operations", async () => {
    const { allEntries } = await import("../../src/catalog/all.js");
    const catalog = new Catalog(allEntries);
    const results = catalog.search("run pipeline build");
    expect(results.length).toBeGreaterThan(0);
    const ids = results.map((r) => r.entry.id);
    expect(ids).toContain("pipelines.runPipeline");
  });
});
