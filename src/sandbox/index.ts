import vm from "node:vm";
import { validateCode, ValidationError } from "./validator.js";

export { ValidationError } from "./validator.js";

export interface SandboxResult {
  success: boolean;
  data?: unknown;
  error?: string;
  logs: string[];
  durationMs: number;
}

interface SandboxOptions {
  timeout?: number;
  maxDepth?: number;
  select?: string[];
}

export async function executeSandboxed(
  code: string,
  proxy: unknown,
  options: SandboxOptions = {},
): Promise<SandboxResult> {
  const { timeout = 120_000 } = options;
  const start = Date.now();
  const logs: string[] = [];

  // Validate before execution
  try {
    validateCode(code);
  } catch (e) {
    return {
      success: false,
      error: e instanceof ValidationError ? e.message : String(e),
      logs: [],
      durationMs: Date.now() - start,
    };
  }

  const context = vm.createContext(
    {
      ado: proxy,
      console: {
        log: (...args: unknown[]) => logs.push(args.map(String).join(" ")),
        warn: (...args: unknown[]) => logs.push(`[warn] ${args.map(String).join(" ")}`),
        error: (...args: unknown[]) => logs.push(`[error] ${args.map(String).join(" ")}`),
      },
      JSON,
      Math,
      Date,
      Array,
      Object,
      Promise,
      setTimeout,
      sleep: (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
      result: undefined as unknown,
    },
    {
      codeGeneration: { strings: false, wasm: false },
    },
  );

  const wrapped = `(async () => { ${code}\n return typeof result !== 'undefined' ? result : undefined; })()`;

  try {
    const script = new vm.Script(wrapped, { timeout });
    const output = await script.runInContext(context, { timeout });
    return {
      success: true,
      data: output,
      logs,
      durationMs: Date.now() - start,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isTimeout = msg.includes("Script execution timed out");
    return {
      success: false,
      error: isTimeout ? "Execution timed out" : msg,
      logs,
      durationMs: Date.now() - start,
    };
  }
}
