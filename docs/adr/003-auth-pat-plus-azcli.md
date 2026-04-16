# ADR-003: PAT + Azure CLI Authentication Strategy

## Status
Accepted

## Context
Microsoft's ADO MCP server supports four authentication mechanisms:
1. **Interactive OAuth** via MSAL — opens a browser for login
2. **Azure CLI** — piggybacks on `az login` session
3. **Environment variable** — `PERSONAL_ACCESS_TOKEN` with base64-encoded `email:token`
4. **PAT** — Personal Access Token via `PERSONAL_ACCESS_TOKEN` env var

We need to choose which mechanisms to support for a headless CLI tool used in Claude Code sessions.

## Decision
**Support two mechanisms: PAT via environment variable and Azure CLI via `@azure/identity`.**

Configuration:
```
AZURE_DEVOPS_ORG=myorg           # required
AZURE_DEVOPS_PAT=xxxx            # optional, raw token (not base64-encoded)
AZURE_DEVOPS_AUTH=pat|azcli|auto # default: auto
```

Auto-detect logic: if `AZURE_DEVOPS_PAT` is set, use PAT. Otherwise, attempt Azure CLI.

## Rationale

### No interactive OAuth
Interactive browser-based authentication requires a running browser and user interaction. Claude Code sessions are headless CLI environments. Opening a browser window mid-session breaks the workflow and cannot be handled by the LLM. This is hostile UX for the target use case.

### PAT for local development and CI
Personal Access Tokens are the most widely used authentication method for Azure DevOps CLI tooling. They work in:
- Local development (developer generates PAT in ADO settings)
- CI/CD pipelines (PAT stored as pipeline secret)
- Containers and remote compute (no browser available)

We accept the raw PAT string (not base64-encoded) and handle encoding internally. This differs from Microsoft's server which expects the pre-encoded form — our approach is less error-prone for users.

### Azure CLI for SSO environments
Organizations using Entra ID (Azure AD) for SSO can authenticate via `az login` once and all tools that use `@azure/identity`'s `AzureCliCredential` inherit the session. This is the natural authentication path for enterprise environments where PATs are discouraged or rotated frequently.

## Consequences
- Users need either a PAT or an active `az login` session
- No browser interaction required during Claude Code sessions
- The `@azure/identity` package adds ~500KB to the bundle but is already a dependency of `azure-devops-node-api`
- Auto-detect makes the zero-config experience work: set `AZURE_DEVOPS_ORG` and `AZURE_DEVOPS_PAT`, then `npx ado-code-mode-mcp` just works
