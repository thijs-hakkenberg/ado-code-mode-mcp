# ADR-001: Code Mode Architecture Over Native Tool Registration

## Status
Accepted

## Context
The official Microsoft Azure DevOps MCP server (`@azure-devops/mcp` v2.5.0) exposes 99 tools across 9 domains. When loaded into a Claude Code session, these tool schemas consume approximately 89,000-98,000 tokens of bootstrap context before any useful reasoning begins. Most sessions use only 5-10 of those tools.

The MCP Code Mode classification framework identifies three structural variants for reducing this cost. The ADO MCP server falls squarely into **Variant 1: Large External API Surface** — a large authenticated REST API proxy where the model has limited pretraining familiarity with the specific API surface.

We evaluated three approaches to building a token-efficient alternative:

### Option A: Standalone Server (chosen)
Build a new MCP server from scratch using `@modelcontextprotocol/sdk`. Register only 2 tools (`ado_search` + `ado_execute`). Use the same `azure-devops-node-api` SDK that Microsoft's server uses for ADO REST API calls. Inject an `ado` proxy object into a sandboxed execution environment.

### Option B: ThinMCP-Style Wrapper
Run Microsoft's server as an upstream process. Our server sits in front, exposing search()+execute() and forwarding tool calls.

### Option C: Fork Microsoft's Server
Clone `microsoft/azure-devops-mcp`, replace the 99 tool registrations with 2 Code Mode tools.

## Decision
**Option A: Standalone server calling the ADO API directly via `azure-devops-node-api`.**

## Rationale

### Why not Option B (Wrapper)
Microsoft's server returns `JSON.stringify(result, null, 2)` as raw text content for every tool response. There is no structured output, no projection, no filtering. A wrapper cannot intercept or reshape results before they are serialized — the upstream server owns the serialization boundary. The entire point of Code Mode is result shaping (returning only the fields the model needs). A wrapper that passes through upstream text responses defeats this purpose.

Additionally, the wrapper requires two Node.js processes (upstream + proxy), complicating deployment and debugging. The latency tax of three serialization/deserialization boundaries per operation (Claude → our server → upstream MCP → ADO API → back) is significant.

### Why not Option C (Fork)
Microsoft's server has 7,498 LOC with 99 tool handler functions tightly coupled to individual `server.tool()` registrations with Zod schemas. Each handler is a monolithic async function that fetches data, formats it as a text string, and returns it. Refactoring all handlers into a searchable catalog with result projection would require touching every handler.

Microsoft ships updates frequently (263 npm versions to date). A fork would diverge within weeks, creating an unsustainable merge-conflict burden.

### Why Option A works
The key insight: Microsoft's server uses `azure-devops-node-api` for 95% of its ADO interactions. This is a well-maintained first-party SDK that handles authentication, pagination, and typed responses. We use the same SDK — we do not write raw REST calls. The difference is that instead of registering 99 tools with Zod schemas, we register 2 tools and inject the SDK's typed API as a proxy object into a sandbox.

We selectively borrow patterns from Microsoft's MIT-licensed server (domain organization, auth chain logic, API call patterns) without forking the codebase.

## Consequences

### Token budget
| Component | Native (99 tools) | Code Mode (2 tools) |
|-----------|-------------------|---------------------|
| Bootstrap | ~89,000-98,000 tokens | ~1,000 tokens |
| 5-operation session | ~92,000-108,000 tokens | ~2,500-4,000 tokens |
| Savings | — | ~95-97% |

### Trade-offs
- We must implement and maintain proxy methods for each ADO API domain (~82 operations)
- We must track ADO API changes independently (though the SDK handles most breaking changes)
- We gain full control over result projection, error formatting, and the proxy surface
- We avoid the maintenance burden of a fork and the architectural limitations of a wrapper
