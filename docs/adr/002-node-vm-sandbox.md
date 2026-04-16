# ADR-002: node:vm Sandbox for Code Execution

## Status
Accepted

## Context
The `ado_execute` tool runs JavaScript code that the LLM generates. This code calls methods on an `ado` proxy object to interact with Azure DevOps. We need a sandbox that:

1. Prevents accidental side effects (file system access, network calls, process manipulation)
2. Supports async/await (ADO API calls are asynchronous)
3. Allows injecting the `ado` proxy as a global
4. Has configurable timeouts
5. Does not add heavyweight dependencies

We evaluated three sandbox options:

### node:vm (chosen)
Node.js built-in `vm` module with `createContext`. Zero dependencies. Sub-millisecond startup. Full async/await support. Not a security boundary — code can escape via prototype chain manipulation.

### QuickJS via quickjs-emscripten
WebAssembly-based JavaScript engine. True memory isolation (separate heap per instance). Cross-platform. Adds ~2MB to the package. Does not support native async/await — requires the `asyncify` transform which adds complexity and performance overhead.

### isolated-vm
V8 isolate with enforced memory limits. Strongest isolation. Requires native C++ compilation via node-gyp — the #1 source of npm install failures across platforms. Build tools must be present on the user's system.

## Decision
**Use `node:vm` with `createContext`, frozen globals, banned-pattern source validation, and configurable timeouts.**

## Rationale

### Threat model
The sandbox executes code that a trusted LLM writes. In Claude Code, the same LLM already has unrestricted `Bash` access — it can run arbitrary shell commands, read/write files, and make network calls. The threat model is therefore **not** "untrusted attacker code" but "prevent the LLM from accidentally making unintended side effects through the proxy."

Given this threat model, the security guarantees of `node:vm` (courtesy isolation, not security isolation) are sufficient. We add defense-in-depth through:

1. **Banned pattern validation** — reject code containing `require(`, `import `, `process.`, `child_process`, `global.`, `globalThis.`, `fetch(`, `eval(`, `Function(` before execution
2. **Frozen context** — `Object.freeze` on all injected globals except the `ado` proxy
3. **Code generation disabled** — `codeGeneration: { strings: false, wasm: false }` prevents `eval()` and dynamic `Function()` construction
4. **Timeout enforcement** — configurable execution timeout (default 120s)
5. **Minimal globals** — only `ado`, `console`, `JSON`, `Math`, `Date`, and `sleep` are available

### Why not QuickJS
QuickJS does not support native async/await. The `asyncify` transform required by `quickjs-emscripten` adds significant complexity (callback-based bridging for every async proxy method) and a ~30% performance penalty. Since every ADO API call is asynchronous, async/await is not optional — it is the primary execution pattern.

The additional 2MB package size and 5 sub-dependencies add friction for a single-user local MCP server where the security boundary is already moot.

### Why not isolated-vm
`isolated-vm` requires native C++ compilation. On macOS, this needs Xcode Command Line Tools. On Windows, it needs Visual C++ Build Tools. On Linux, it needs `build-essential`. These are the most common npm install failures reported across the ecosystem.

For an open-source package intended for broad community use via `npx`, a native dependency is a significant adoption barrier. The security benefits (enforced memory limits, true V8 isolate) are not justified given the threat model.

## Consequences
- Zero additional dependencies for the sandbox
- Sub-millisecond sandbox startup (vs ~50ms for QuickJS, ~20ms for isolated-vm)
- Async/await works natively — proxy methods return Promises that the sandbox can `await`
- Not a security boundary — a determined attacker could escape via prototype chain. This is acceptable because the code author (the LLM) already has Bash access.
- Banned pattern validation is a best-effort filter, not a security guarantee
