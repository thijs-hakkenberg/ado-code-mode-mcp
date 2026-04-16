import { describe, it, expect } from "vitest";
import { Domain } from "../../src/catalog/types.js";
import type { CatalogEntry } from "../../src/catalog/types.js";
import { Catalog } from "../../src/catalog/index.js";

const FIXTURES: CatalogEntry[] = [
  {
    id: "work-items.get",
    domain: Domain.WorkItems,
    name: "get",
    title: "Get Work Item",
    description: "Fetch a single work item by ID with all fields.",
    params: [
      { name: "id", type: "number", required: true, description: "Work item ID" },
      { name: "fields", type: "string[]", required: false, description: "Specific fields to return" },
    ],
    returns: "WorkItem — full work item with fields, relations, and metadata",
    example: 'await ado.workItems.get(12345)',
    tags: ["work item", "bug", "story", "task", "pbi", "fetch", "read"],
    readOnly: true,
  },
  {
    id: "work-items.create",
    domain: Domain.WorkItems,
    name: "create",
    title: "Create Work Item",
    description: "Create a new work item (PBI, Task, Bug, Feature, or Epic).",
    params: [
      { name: "project", type: "string", required: true, description: "Project name" },
      { name: "type", type: "string", required: true, description: "Work item type" },
      { name: "fields", type: "object", required: true, description: "Field values" },
    ],
    returns: "WorkItem — the newly created work item",
    example: 'await ado.workItems.create({ project: "MyProj", type: "Task", fields: { "System.Title": "New task" } })',
    tags: ["work item", "create", "new", "add", "pbi", "task", "bug"],
    readOnly: false,
  },
  {
    id: "work.listTeamIterations",
    domain: Domain.Work,
    name: "listTeamIterations",
    title: "List Team Iterations",
    description: "List iterations (sprints) for a team. Use timeframe='current' to get the active sprint.",
    params: [
      { name: "project", type: "string", required: true, description: "Project name" },
      { name: "team", type: "string", required: true, description: "Team name" },
      { name: "timeframe", type: "string", required: false, description: "'current' for active sprint" },
    ],
    returns: "Iteration[] — list of iterations with id, name, start/end dates",
    example: 'await ado.work.listTeamIterations({ project: "MyProj", team: "MyTeam", timeframe: "current" })',
    tags: ["sprint", "iteration", "current sprint", "team", "dates", "schedule"],
    readOnly: true,
  },
  {
    id: "work.getWorkItemsForIteration",
    domain: Domain.Work,
    name: "getWorkItemsForIteration",
    title: "Get Work Items For Iteration",
    description: "Get work item IDs assigned to a specific sprint/iteration.",
    params: [
      { name: "project", type: "string", required: true, description: "Project name" },
      { name: "team", type: "string", required: true, description: "Team name" },
      { name: "iterationId", type: "string", required: true, description: "Iteration ID from listTeamIterations" },
    ],
    returns: "WorkItemRef[] — list of work item references with IDs",
    example: 'await ado.work.getWorkItemsForIteration({ project: "MyProj", team: "MyTeam", iterationId: "abc-123" })',
    tags: ["sprint", "iteration", "work items", "sprint items", "assigned"],
    readOnly: true,
  },
  {
    id: "pipelines.run",
    domain: Domain.Pipelines,
    name: "run",
    title: "Run Pipeline",
    description: "Trigger a pipeline build run.",
    params: [
      { name: "project", type: "string", required: true, description: "Project name" },
      { name: "definitionId", type: "number", required: true, description: "Pipeline definition ID" },
      { name: "branch", type: "string", required: false, description: "Source branch (default: main)" },
    ],
    returns: "Build — the queued build with ID and status",
    example: 'await ado.pipelines.run({ project: "MyProj", definitionId: 42 })',
    tags: ["pipeline", "build", "run", "trigger", "ci", "cd", "deploy"],
    readOnly: false,
  },
];

describe("Catalog", () => {
  describe("constructor", () => {
    it("should create a catalog from entries", () => {
      const catalog = new Catalog(FIXTURES);
      expect(catalog.size).toBe(5);
    });

    it("should create an empty catalog", () => {
      const catalog = new Catalog([]);
      expect(catalog.size).toBe(0);
    });
  });

  describe("search", () => {
    it("should find entries matching a keyword", () => {
      const catalog = new Catalog(FIXTURES);
      const results = catalog.search("work item");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].entry.domain).toBe(Domain.WorkItems);
    });

    it("should rank title matches higher than tag matches", () => {
      const catalog = new Catalog(FIXTURES);
      const results = catalog.search("Get Work Item");
      expect(results[0].entry.id).toBe("work-items.get");
    });

    it("should find sprint-related entries", () => {
      const catalog = new Catalog(FIXTURES);
      const results = catalog.search("current sprint items");
      const ids = results.map((r) => r.entry.id);
      expect(ids).toContain("work.listTeamIterations");
      expect(ids).toContain("work.getWorkItemsForIteration");
    });

    it("should return empty for no matches", () => {
      const catalog = new Catalog(FIXTURES);
      const results = catalog.search("xyzzy nonexistent");
      expect(results).toHaveLength(0);
    });

    it("should respect the limit parameter", () => {
      const catalog = new Catalog(FIXTURES);
      const results = catalog.search("work", { limit: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it("should filter by domain", () => {
      const catalog = new Catalog(FIXTURES);
      const results = catalog.search("items", { domain: Domain.Work });
      for (const r of results) {
        expect(r.entry.domain).toBe(Domain.Work);
      }
    });

    it("should handle empty query gracefully", () => {
      const catalog = new Catalog(FIXTURES);
      const results = catalog.search("");
      expect(results).toHaveLength(0);
    });

    it("should be case-insensitive", () => {
      const catalog = new Catalog(FIXTURES);
      const upper = catalog.search("PIPELINE");
      const lower = catalog.search("pipeline");
      expect(upper.length).toBe(lower.length);
      expect(upper[0].entry.id).toBe(lower[0].entry.id);
    });
  });

  describe("getById", () => {
    it("should return an entry by ID", () => {
      const catalog = new Catalog(FIXTURES);
      const entry = catalog.getById("work-items.get");
      expect(entry).toBeDefined();
      expect(entry!.title).toBe("Get Work Item");
    });

    it("should return undefined for unknown ID", () => {
      const catalog = new Catalog(FIXTURES);
      expect(catalog.getById("nonexistent")).toBeUndefined();
    });
  });

  describe("listByDomain", () => {
    it("should list all entries for a domain", () => {
      const catalog = new Catalog(FIXTURES);
      const entries = catalog.listByDomain(Domain.Work);
      expect(entries).toHaveLength(2);
      for (const e of entries) {
        expect(e.domain).toBe(Domain.Work);
      }
    });

    it("should return empty for domain with no entries", () => {
      const catalog = new Catalog(FIXTURES);
      const entries = catalog.listByDomain(Domain.Wiki);
      expect(entries).toHaveLength(0);
    });
  });

  describe("format", () => {
    it("should format search results as compact text", () => {
      const catalog = new Catalog(FIXTURES);
      const results = catalog.search("sprint", { limit: 2 });
      const formatted = Catalog.formatResults(results);
      expect(formatted).toContain("ado.work.listTeamIterations");
      expect(formatted).toContain("[read-only]");
      expect(formatted).toContain("Iteration[]");
    });
  });
});
