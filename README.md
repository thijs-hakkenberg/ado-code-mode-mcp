# ado-code-mode-mcp

Token-efficient Azure DevOps MCP server using the [Code Mode pattern](docs/adr/001-code-mode-over-native-tools.md). Replaces 99 tools with 2 — reducing bootstrap context from ~98K tokens to ~1K.

## Why

The official Microsoft Azure DevOps MCP server (`@azure-devops/mcp`) exposes 99 tools. Loading all tool schemas costs ~89,000-98,000 tokens before any useful reasoning begins. Most sessions use 5-10 tools.

This server exposes 2 tools:
- **`ado_search`** — discover available operations by keyword
- **`ado_execute`** — run JavaScript code against a sandboxed `ado` proxy object

The model writes code that calls `ado.workItems.get(123)` instead of invoking individual tools. Results are projected (only requested fields returned), saving 50-75% of response tokens too.

## Install

One-liner for Claude Code:

```bash
claude mcp add ado -- npx -y ado-code-mode-mcp --org myorg
```

Replace `myorg` with your Azure DevOps organization (the part before `.visualstudio.com` or after `dev.azure.com/`).

For PAT authentication, set the env var first:
```bash
export AZURE_DEVOPS_PAT=your-pat-here
claude mcp add ado -- npx -y ado-code-mode-mcp --org myorg
```

For comparison, the official Microsoft ADO MCP server installs with:
```bash
claude mcp add azure-devops -- npx -y @azure-devops/mcp myorg
```
That loads 99 tools (~98K tokens). This server loads 2 tools (~1K tokens).

### Alternative: `.mcp.json` configuration

```json
{
  "mcpServers": {
    "ado": {
      "command": "npx",
      "args": ["-y", "ado-code-mode-mcp", "--org", "myorg"],
      "env": {
        "AZURE_DEVOPS_PAT": "your-pat-here"
      }
    }
  }
}
```

### Standalone

```bash
# With PAT authentication
AZURE_DEVOPS_ORG=myorg AZURE_DEVOPS_PAT=xxxx npx ado-code-mode-mcp

# With Azure CLI authentication (requires 'az login' first)
AZURE_DEVOPS_ORG=myorg npx ado-code-mode-mcp
```

## Usage

### Search for operations
```
ado_search({ query: "current sprint work items" })
```
Returns matching operations with signatures and examples:
```
Found 3 operations:

1. work.listTeamIterations [read-only]
   await ado.work.listTeamIterations({ project: "MyProj", team: "MyTeam", timeframe: "current" })
   → Iteration[] — List iterations/sprints for a team

2. work.getWorkItemsForIteration [read-only]
   await ado.work.getWorkItemsForIteration({ project: "MyProj", team: "MyTeam", iterationId: "abc" })
   → WorkItemRef[] — Get work item IDs for a sprint
```

### Execute operations
```javascript
ado_execute({
  code: `
    const iters = await ado.work.listTeamIterations({ project: "MyProj", team: "MyTeam", timeframe: "current" });
    const items = await ado.work.getWorkItemsForIteration({ project: "MyProj", team: "MyTeam", iterationId: iters[0].id });
    const details = await ado.workItems.getBatch(items.map(i => i.id));
    result = details.map(d => ({
      id: d.id,
      title: d.fields["System.Title"],
      state: d.fields["System.State"],
      assigned: d.fields["System.AssignedTo"]?.displayName
    }));
  `,
  project: "MyProj",
  team: "MyTeam"
})
```

Returns only the projected fields — not the full ADO API response.

## Token Budget

| Component | Microsoft's Server (99 tools) | This Server (2 tools) |
|-----------|------------------------------|----------------------|
| Bootstrap | ~89,000-98,000 tokens | ~1,000 tokens |
| Sprint review flow | ~3,900 tokens in responses | ~200 tokens (projected) |
| 5-operation session | ~92,000-108,000 tokens | ~2,500-4,000 tokens |
| **Savings** | — | **~95-97%** |

## Available Domains

| Domain | Operations | Proxy |
|--------|-----------|-------|
| Work Items | get, getBatch, create, update, query, comment, link, ... | `ado.workItems.*` |
| Work | iterations, capacity, team settings, boards | `ado.work.*` |
| Repositories | repos, PRs, branches, commits, diffs, threads | `ado.repos.*` |
| Pipelines | builds, runs, definitions, logs, artifacts | `ado.pipelines.*` |
| Core | projects, teams | `ado.core.*` |
| Wiki | pages, content | `ado.wiki.*` |
| Search | code, work items, wiki | `ado.search.*` |
| Test Plans | plans, suites, cases, results | `ado.testPlans.*` |
| Security | alerts | `ado.security.*` |

## Authentication

Two mechanisms (see [ADR-003](docs/adr/003-auth-pat-plus-azcli.md)):

1. **PAT** — set `AZURE_DEVOPS_PAT` environment variable with your Personal Access Token
2. **Azure CLI** — run `az login` first, then the server uses your Azure CLI session

Auto-detection: PAT takes precedence if set, otherwise Azure CLI.

## Architecture

See the [Architecture Decision Records](docs/adr/):
- [ADR-001: Code Mode over native tools](docs/adr/001-code-mode-over-native-tools.md)
- [ADR-002: node:vm sandbox](docs/adr/002-node-vm-sandbox.md)
- [ADR-003: PAT + Azure CLI auth](docs/adr/003-auth-pat-plus-azcli.md)

## Development

```bash
npm install
npm test        # run unit tests
npm run build   # compile TypeScript
npm run dev     # run with tsx (dev mode)
```

## License

MIT
