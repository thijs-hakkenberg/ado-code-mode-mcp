import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Catalog } from "./catalog/index.js";
import { Domain } from "./catalog/types.js";
import { executeSandboxed } from "./sandbox/index.js";
import { project as projectResult } from "./sandbox/projector.js";

interface ServerOptions {
  catalog: Catalog;
  proxyFactory: () => unknown;
  timeout?: number;
}

export function createServer(options: ServerOptions): McpServer {
  const { catalog, proxyFactory, timeout = 120_000 } = options;

  const server = new McpServer({
    name: "ado-code-mode-mcp",
    version: "0.1.0",
  });

  // Tool 1: ado_search
  server.tool(
    "ado_search",
    "Search for Azure DevOps operations by keyword or domain. Returns operation signatures and example calls. Use this to discover what operations are available before writing execute code.",
    {
      query: z.string().describe("Natural language search, e.g. 'get work items for current sprint' or 'create pull request'"),
      domain: z.enum([
        Domain.WorkItems, Domain.Work, Domain.Repositories, Domain.Pipelines,
        Domain.Core, Domain.Wiki, Domain.Search, Domain.TestPlans, Domain.Security,
      ]).optional().describe("Filter to a specific domain"),
      limit: z.number().min(1).max(20).default(8).optional().describe("Max results to return"),
    },
    async ({ query, domain, limit }) => {
      const results = catalog.search(query, { domain: domain as Domain | undefined, limit });
      const formatted = Catalog.formatResults(results);
      return { content: [{ type: "text" as const, text: formatted }] };
    },
  );

  // Tool 2: ado_execute
  server.tool(
    "ado_execute",
    `Execute JavaScript code that calls Azure DevOps operations via the \`ado\` proxy object. Use ado_search first to discover available operations and their signatures. The code runs in a sandbox with the \`ado\` object pre-injected. Assign to \`result\` to return data.

Available proxy namespaces: ado.workItems, ado.work, ado.repos, ado.pipelines, ado.core, ado.wiki, ado.search, ado.testPlans, ado.security`,
    {
      code: z.string().describe("JavaScript code to execute. Use 'result = ...' to return data. Has access to: ado (ADO proxy), console.log, JSON, Math, Date."),
      project: z.string().optional().describe("Default project name (available as variable 'project' in code)"),
      team: z.string().optional().describe("Default team name (available as variable 'team' in code)"),
    },
    async ({ code, project: proj, team }) => {
      const proxy = proxyFactory();

      // Inject project/team as variables if provided
      let wrappedCode = "";
      if (proj) wrappedCode += `const project = ${JSON.stringify(proj)};\n`;
      if (team) wrappedCode += `const team = ${JSON.stringify(team)};\n`;
      wrappedCode += code;

      const res = await executeSandboxed(wrappedCode, proxy, { timeout });

      if (!res.success) {
        const text = `Error: ${res.error}${res.logs.length > 0 ? "\n\nLogs:\n" + res.logs.join("\n") : ""}`;
        return { content: [{ type: "text" as const, text }] };
      }

      const projected = res.data !== undefined ? projectResult(res.data, {}) : undefined;
      const parts: string[] = [];
      if (projected !== undefined) {
        parts.push(typeof projected === "string" ? projected : JSON.stringify(projected, null, 2));
      }
      if (res.logs.length > 0) {
        parts.push(`\nLogs:\n${res.logs.join("\n")}`);
      }
      if (parts.length === 0) {
        parts.push("Executed successfully (no result returned).");
      }

      return { content: [{ type: "text" as const, text: parts.join("\n") }] };
    },
  );

  return server;
}
