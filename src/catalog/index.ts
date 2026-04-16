import type { CatalogEntry, SearchResult } from "./types.js";
import { Domain } from "./types.js";

export { Domain } from "./types.js";
export type { CatalogEntry, OperationParam, SearchResult } from "./types.js";

interface SearchOptions {
  limit?: number;
  domain?: Domain;
}

export class Catalog {
  private entries: CatalogEntry[];
  private byId: Map<string, CatalogEntry>;
  private byDomain: Map<Domain, CatalogEntry[]>;

  constructor(entries: CatalogEntry[]) {
    this.entries = entries;
    this.byId = new Map(entries.map((e) => [e.id, e]));
    this.byDomain = new Map();
    for (const e of entries) {
      const list = this.byDomain.get(e.domain) ?? [];
      list.push(e);
      this.byDomain.set(e.domain, list);
    }
  }

  get size(): number {
    return this.entries.length;
  }

  getById(id: string): CatalogEntry | undefined {
    return this.byId.get(id);
  }

  listByDomain(domain: Domain): CatalogEntry[] {
    return this.byDomain.get(domain) ?? [];
  }

  search(query: string, options: SearchOptions = {}): SearchResult[] {
    const { limit = 8, domain } = options;

    if (!query.trim()) return [];

    const tokens = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 0);

    const candidates = domain
      ? this.listByDomain(domain)
      : this.entries;

    const scored: SearchResult[] = [];

    for (const entry of candidates) {
      let score = 0;
      const titleLower = entry.title.toLowerCase();
      const descLower = entry.description.toLowerCase();
      const tagsLower = entry.tags.map((t) => t.toLowerCase());
      const domainLower = entry.domain.toLowerCase();

      // Exact full-query match in title gets a large bonus
      const queryLower = query.toLowerCase();
      if (titleLower === queryLower) score += 20;
      else if (titleLower.includes(queryLower)) score += 10;

      for (const token of tokens) {
        if (titleLower.includes(token)) score += 3;
        if (descLower.includes(token)) score += 2;
        if (tagsLower.some((t) => t.includes(token))) score += 1;
        if (domainLower.includes(token)) score += 1;
      }

      if (score > 0) {
        scored.push({ entry, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  static formatResults(results: SearchResult[]): string {
    if (results.length === 0) return "No matching operations found.";

    const lines: string[] = [
      `Found ${results.length} operation${results.length === 1 ? "" : "s"}:\n`,
    ];

    for (let i = 0; i < results.length; i++) {
      const { entry } = results[i];
      const rwLabel = entry.readOnly ? " [read-only]" : "";
      lines.push(`${i + 1}. ${entry.id}${rwLabel}`);
      lines.push(`   ${entry.example}`);
      lines.push(`   → ${entry.returns}`);
      if (i < results.length - 1) lines.push("");
    }

    return lines.join("\n");
  }
}
