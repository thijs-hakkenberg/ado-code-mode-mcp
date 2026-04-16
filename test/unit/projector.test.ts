import { describe, it, expect } from "vitest";
import { project, type ProjectorOptions } from "../../src/sandbox/projector.js";

describe("project", () => {
  describe("field selection", () => {
    it("should select specific top-level fields", () => {
      const input = { id: 1, title: "Test", state: "Active", _links: { self: "..." }, url: "https://..." };
      const result = project(input, { select: ["id", "title", "state"] });
      expect(result).toEqual({ id: 1, title: "Test", state: "Active" });
    });

    it("should select nested fields with dot notation", () => {
      const input = {
        id: 1,
        fields: { "System.Title": "My Item", "System.State": "Active", "System.Description": "long..." },
      };
      const result = project(input, { select: ["id", "fields.System.Title", "fields.System.State"] });
      expect(result).toEqual({
        id: 1,
        fields: { "System.Title": "My Item", "System.State": "Active" },
      });
    });

    it("should return full object when no select is specified", () => {
      const input = { id: 1, name: "test" };
      const result = project(input, {});
      expect(result).toEqual({ id: 1, name: "test" });
    });
  });

  describe("depth limiting", () => {
    it("should truncate beyond maxDepth", () => {
      const input = { a: { b: { c: { d: "deep" } } } };
      const result = project(input, { maxDepth: 2 });
      expect(result).toEqual({ a: { b: "[object]" } });
    });

    it("should preserve values within maxDepth", () => {
      const input = { a: { b: "value" } };
      const result = project(input, { maxDepth: 3 });
      expect(result).toEqual({ a: { b: "value" } });
    });

    it("should use default depth of 3", () => {
      const input = { a: { b: { c: "ok" } } };
      const result = project(input, {});
      expect(result).toEqual({ a: { b: { c: "ok" } } });
    });
  });

  describe("array truncation", () => {
    it("should truncate arrays beyond maxArrayLength", () => {
      const input = { items: Array.from({ length: 100 }, (_, i) => i) };
      const result = project(input, { maxArrayLength: 5 }) as { items: unknown[] };
      expect(result.items).toHaveLength(6); // 5 items + truncation marker
      expect(result.items[5]).toBe("[...95 more]");
    });

    it("should not truncate arrays within limit", () => {
      const input = { items: [1, 2, 3] };
      const result = project(input, { maxArrayLength: 10 });
      expect(result).toEqual({ items: [1, 2, 3] });
    });
  });

  describe("string truncation", () => {
    it("should truncate long strings", () => {
      const longStr = "x".repeat(2000);
      const input = { description: longStr };
      const result = project(input, { maxStringLength: 100 }) as { description: string };
      expect(result.description.length).toBeLessThan(200);
      expect(result.description).toContain("...[truncated]");
    });

    it("should not truncate short strings", () => {
      const input = { name: "hello" };
      const result = project(input, { maxStringLength: 100 });
      expect(result).toEqual({ name: "hello" });
    });
  });

  describe("null/undefined stripping", () => {
    it("should strip null values", () => {
      const input = { id: 1, name: null, title: "Test" };
      const result = project(input, {});
      expect(result).toEqual({ id: 1, title: "Test" });
    });

    it("should strip undefined values", () => {
      const input = { id: 1, name: undefined, title: "Test" };
      const result = project(input, {});
      expect(result).toEqual({ id: 1, title: "Test" });
    });
  });

  describe("default strip patterns", () => {
    it("should strip _links by default", () => {
      const input = { id: 1, title: "Test", _links: { self: { href: "..." } } };
      const result = project(input, {});
      expect(result).toEqual({ id: 1, title: "Test" });
    });

    it("should strip url fields by default", () => {
      const input = { id: 1, title: "Test", url: "https://dev.azure.com/..." };
      const result = project(input, {});
      expect(result).toEqual({ id: 1, title: "Test" });
    });
  });

  describe("arrays of objects", () => {
    it("should project each element in an array", () => {
      const input = [
        { id: 1, title: "A", _links: {} },
        { id: 2, title: "B", _links: {} },
      ];
      const result = project(input, { select: ["id", "title"] });
      expect(result).toEqual([
        { id: 1, title: "A" },
        { id: 2, title: "B" },
      ]);
    });
  });

  describe("primitives", () => {
    it("should return primitives unchanged", () => {
      expect(project(42, {})).toBe(42);
      expect(project("hello", {})).toBe("hello");
      expect(project(true, {})).toBe(true);
    });

    it("should return null for null input", () => {
      expect(project(null, {})).toBeNull();
    });
  });
});
